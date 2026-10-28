/**
 * Two-level expense categorisation (Phase 6, ADR-0011; parents reworked
 * 2026-07-19 per Josh — fewer, more intuitive top-level buckets + a much
 * larger keyword database; matcher rebuilt as a scorer per ADR-0019 / Phase 18
 * §1, from Josh's reference engine in docs/reference/categoryMatrix-2026-08-27.ts).
 *
 * SEVEN parent categories, modelled on what mainstream money apps use
 * (Splitwise: Food/Home/Transport/…; Monarch/Mint: Groceries, Bills &
 * Utilities, Food & Dining, …):
 *
 *   Groceries · Eating out · Bills & rent · Transport · Household ·
 *   Leisure · Other
 *
 * Each parent holds SUBCATEGORIES, curated for a South African household
 * (prepaid electricity, DSTV, airtime, e-tolls, domestic help, armed response,
 * medical aid, municipal rates…). `autoCategory(desc)` returns a subcategory
 * slug — always overridable.
 *
 * HOW MATCHING WORKS
 * ------------------
 * Every subcategory is SCORED and the strongest evidence wins; registry order
 * is only a tie-breaker, so keywords can be added anywhere without worrying
 * about position. Each subcategory lists its vocabulary in four tiers:
 *
 *   brands     distinctive merchants — 1 per word +1, typo-tolerant ("netflx")
 *   keywords   ordinary "what was bought" words — 1 per word, +1 for a phrase
 *   weak       ambiguous words ("bar", "ticket", "dinner") — 0.75, so any
 *              specific item beats them: "groceries for dinner" → Groceries
 *   retailers  multi-purpose stores (Checkers, Takealot) — 0.5, they say WHERE
 *              not WHAT: "wine at checkers" → Liquor, bare "checkers" → Groceries
 *
 * Text is normalised (lower-cased, accents stripped, tokenised) and phrases
 * also match with separators removed, so "ster kinekor" == "ster-kinekor" ==
 * "sterkinekor" and "pick 'n pay" == "picknpay" — but only on whole-word
 * boundaries, so "drinking games" can't spell "in-game". Single words hit a
 * whole token, a plural, or a ≥6-char prefix ("grocer" → "groceries"); never
 * a bare substring ("car" ✗ "cardigan", "tea" ✗ "steam"). A word the library
 * already knows exactly is never re-read as someone else's plural, prefix or
 * typo — "bolts" (hardware) is not "bolt" (rideshare). Within a subcategory a
 * word is credited once, at its strongest reading.
 *
 * Storage: expense.category is free text; slugs stored as-is. Legacy slugs
 * (incl. the retired "rent"/"utilities"/"entertainment" parents) still resolve
 * because they remain in the registry, re-parented to their new home. No
 * migration. Readable snapshot of the whole library: docs/CATEGORY-MATRIX.md.
 */

/** The seven parent categories (stable display order). */
export type ParentCategory =
  | "groceries"
  | "eatingout"
  | "bills"
  | "transport"
  | "household"
  | "leisure"
  | "other";

/** A stored category slug — a subcategory, or a bare parent slug (legacy/general). */
export type Category = string;

/**
 * Who chose an expense's category (Phase 18 §5): the matcher, a person in
 * the picker, or a learned rule (§2). Legacy rows are all "auto".
 */
export type CategorySource = "auto" | "manual" | "learned";

/**
 * Parent display metadata (Phase 11).
 *
 * `color` is a TOKEN REFERENCE, not a literal — these used to be the dark
 * theme's hex values baked in here, so they survived the reskin unchanged and
 * ignored the palette entirely. Anything tinting from them must use
 * `color-mix()`; string-concatenating an alpha suffix onto a hex only worked
 * while these were literals.
 *
 * `codepoint` is the Twemoji glyph vendored in /public/icons/twemoji, so the
 * icon looks identical on every OS instead of shifting with the platform's
 * emoji font. `icon` stays as the plain character for text-only contexts and
 * as a fallback.
 */
export const CATEGORY_META: Record<
  ParentCategory,
  { label: string; color: string; icon: string; codepoint: string }
> = {
  groceries: { label: "Groceries", color: "var(--cat-groceries)", icon: "🛒", codepoint: "1f6d2" },
  eatingout: { label: "Eating out", color: "var(--cat-eatingout)", icon: "🍝", codepoint: "1f35d" },
  bills: { label: "Bills & rent", color: "var(--cat-rent)", icon: "🏠", codepoint: "1f3e0" },
  transport: { label: "Transport", color: "var(--cat-transport)", icon: "🚗", codepoint: "1f697" },
  household: { label: "Household", color: "var(--cat-household)", icon: "🧴", codepoint: "1f9f4" },
  leisure: { label: "Leisure", color: "var(--cat-entertainment)", icon: "🎬", codepoint: "1f3ac" },
  other: { label: "Other", color: "var(--cat-other)", icon: "💳", codepoint: "1f4b3" },
};

/** Non-category glyphs the design also specifies, same vendored set. */
export const GLYPHS = {
  settlement: "1f91d",
  unknown: "1f9fe",
  recurring: "1f501",
  utilities: "1f4a1",
} as const;

export const PARENT_CATEGORIES = Object.keys(CATEGORY_META) as ParentCategory[];

export interface SubcategoryDef {
  slug: string;
  parent: ParentCategory;
  label: string;
  /** Ordinary evidence of what was bought. Empty on most "general" buckets. */
  keywords: string[];
  /**
   * Distinctive names — merchants, or a word that names the bucket outright
   * ("groceries"): stronger, and matched through one-letter typos.
   */
  brands?: string[];
  /** Ambiguous words that only decide when nothing more specific is present. */
  weak?: string[];
  /** Multi-purpose stores: a nudge toward this bucket, overridden by any item. */
  retailers?: string[];
  /** Kept only so old stored slugs resolve; hidden from the picker. */
  legacy?: true;
}

// Reusable keyword blocks -----------------------------------------------------

// The everyday-groceries vocabulary: staples, produce, pantry, household brands.
// This is the "huge database of words" so "cheese", "chicken", "bread" etc all
// land on Groceries automatically. Afrikaans staples are included because
// that's how plenty of SA households write a shopping note.
const GROCERY_WORDS = [
  "supermarket", "big shop", "monthly shop", "weekly shop",
  "grocery shop", "grocery run", "food shopping", "ingredients", "farmers market", "spaza",
  "spaza shop", "corner shop", "boodskappe",
  // dairy & eggs
  "milk", "long life milk", "fresh milk", "bread", "loaf", "eggs", "egg", "butter", "margarine",
  "cheese", "cheddar", "gouda", "feta", "mozzarella", "parmesan", "halloumi", "cream cheese",
  "cottage cheese", "yoghurt", "yogurt", "cream", "sour cream", "amasi", "maas", "buttermilk",
  "melk", "brood", "kaas", "eiers",
  // pantry
  "rice", "basmati", "pasta", "spaghetti", "macaroni", "penne", "lasagne", "noodles",
  "two minute noodles", "flour", "cake flour", "bread flour", "maize", "mielie meal",
  "maize meal", "pap", "samp", "oats", "cereal", "weetbix", "weet-bix", "pronutro",
  "cornflakes", "muesli", "granola", "sugar", "brown sugar", "salt", "pepper", "spice",
  "spices", "curry powder", "cooking oil", "olive oil", "sunflower oil", "vinegar",
  "tomato sauce", "ketchup", "mayo", "mayonnaise", "mustard", "chutney", "jam", "honey",
  "syrup", "peanut butter", "marmite", "bovril", "stock cube", "stock cubes", "gravy",
  "soup", "pasta sauce", "tinned tomatoes", "baked beans", "canned", "tinned", "ice", "bag of ice",
  "baking powder", "bicarb", "yeast", "vanilla", "cocoa", "icing sugar", "custard",
  "jelly", "condensed milk", "frozen veg", "frozen vegetables", "frozen pizza", "fish fingers",
  "oven chips", "pizza base",
  // meat & protein
  "chicken", "chicken breast", "chicken thighs", "chicken wings", "whole chicken", "beef",
  "mince", "steak", "pork", "lamb", "sausage", "sausages", "boerewors", "wors", "bacon",
  "ham", "polony", "viennas", "russians", "fish", "hake", "tuna", "salmon", "kingklip",
  "snoek", "prawns", "calamari", "pilchards", "sardines", "tofu", "vleis", "hoender",
  // produce
  "vegetables", "veggies", "veg", "fruit", "fruits", "groente", "vrugte", "apple", "apples",
  "banana", "bananas", "orange", "oranges", "naartjie", "naartjies", "grapes", "berries",
  "strawberry", "strawberries", "blueberry", "blueberries", "raspberry", "raspberries", "pear", "pears", "peach", "peaches", "plums",
  "nectarines", "mango", "mangoes", "pineapple", "watermelon", "melon", "kiwi", "litchis",
  "tomato", "tomatoes", "potato", "potatoes", "sweet potato", "onion", "onions", "carrot",
  "carrots", "lettuce", "spinach", "cabbage", "broccoli", "cauliflower", "cucumber",
  "butternut", "butternut squash", "gem squash", "pumpkin", "zucchini", "baby marrows",
  "peppers", "green pepper", "avocado", "avo", "avos", "garlic", "ginger", "chilli",
  "lemon", "lemons", "lime", "mushroom", "mushrooms", "corn", "mielies", "beans",
  "green beans", "lentils", "chickpeas", "peas", "herbs", "coriander", "basil", "salad",
  "rocket", "beetroot",
  // bakery, snacks, drinks
  "bakery", "rolls", "bread rolls", "buns", "cake", "muffin", "muffins", "croissant",
  "croissants", "biscuit", "biscuits", "cookies", "rusks", "chocolate", "chocolate bar",
  "sweets", "candy", "snacks", "nuts", "peanuts", "cashews", "popcorn", "chips", "crisps",
  "ice cream", "juice", "cooldrink", "cooldrinks", "cold drink", "cold drinks", "soft drinks",
  "soda", "fizzy", "coffee", "coffee beans", "coffee pods", "instant coffee", "nespresso pods",
  "tea", "tea bags", "rooibos", "koffie", "sparkling water", "bottled water", "still water",
  "mineral water", "energy drink", "energy drinks", "protein bar", "granola bar", "baby food",
  "formula", "baby formula",
];

// Grocery brands: specific enough to be ordinary keywords, but never "brands" in
// the engine sense — a Coke at a restaurant is still eating out.
const GROCERY_BRANDS = [
  "simba", "nik naks", "niknaks", "doritos", "lays", "pringles", "fritos", "ghost pops",
  "oreo", "kitkat", "kit kat", "bar one", "cadbury", "lindt", "beacon", "jelly tots",
  "smarties", "chappies", "stimorol", "mentos", "astros", "tennis biscuits", "marie biscuits",
  "eet-sum-mor", "provita", "salticrax", "ouma rusks", "nutella", "black cat peanut butter",
  "sasko", "albany bread", "blue ribbon", "clover", "parmalat", "danone", "ultra mel",
  "fatti's & moni's", "koo", "all gold", "rhodes", "i&j", "mccain", "rainbow chicken",
  "county fair", "tastic", "spekko", "white star", "iwisa", "ace maize", "jungle oats",
  "kellogg's", "bokomo", "nestle", "nescafe", "ricoffy", "frisco", "five roses", "joko",
  "freshpak", "lipton", "tropika", "oros", "coca-cola", "coke", "pepsi", "fanta", "sprite",
  "stoney", "appletiser", "grapetiser", "liqui fruit", "ceres juice", "fruitree", "red bull",
  "monster energy", "powerade", "lancewood", "stork", "sunfoil", "excella", "mrs balls",
  "knorr", "royco", "aromat", "robertsons", "maggi", "huletts", "selati", "snowflake",
  "golden cloud", "willards", "yum yum", "tiger brands",
];

/**
 * The registry. Order is only a tie-breaker (earlier wins on an exactly equal
 * score) and the picker's display order within each parent; it does NOT drive
 * detection. Each parent's "general" bucket (slug === parent) is the manual /
 * fallback choice and legacy rows land there too; some carry `weak` words so a
 * vague description ("Bill", "Shopping") still lands under the right parent.
 */
export const SUBCATEGORIES: SubcategoryDef[] = [
  // --- Bills & rent (the "monthly expenses" bucket). Legacy rent_/utilities_
  //     slugs live here now. ---
  {
    slug: "rent", parent: "bills", label: "Rent / bond",
    keywords: ["rent", "rental", "monthly rent", "house rent", "flat rent", "room rent", "bond",
      "bond repayment", "bond payment", "home loan", "mortgage", "lease", "landlord",
      "letting agent", "rental agent", "boarding", "huur"],
  },
  {
    slug: "rent_levies", parent: "bills", label: "Levies & rates",
    keywords: ["levy", "levies", "rates and taxes", "body corporate", "hoa",
      "homeowners association", "sectional title", "estate levy", "property rates",
      "municipal rates"],
    weak: ["rates"],
  },
  {
    slug: "rent_deposit", parent: "bills", label: "Deposit",
    keywords: ["deposit", "damage deposit", "rental deposit", "security deposit", "key deposit"],
  },
  {
    slug: "utilities_electricity", parent: "bills", label: "Electricity / prepaid",
    keywords: ["electric", "electricity", "prepaid electric", "prepaid electricity",
      "electricity units", "electricity token", "load shedding", "loadshedding", "kwh", "krag"],
    brands: ["eskom", "city power", "centlec"],
    weak: ["prepaid", "units"],
  },
  {
    slug: "utilities_water", parent: "bills", label: "Water & municipal",
    keywords: ["water bill", "water account", "water and lights", "municipal", "municipality",
      "municipal account", "municipal bill", "sanitation", "refuse", "refuse removal", "sewer",
      "sewerage", "city of joburg", "coj", "city of tshwane", "tshwane", "ekurhuleni",
      "city of cape town", "ethekwini"],
    brands: ["rand water", "joburg water", "johannesburg water"],
    weak: ["water"],
  },
  {
    slug: "utilities_internet", parent: "bills", label: "Internet / fibre",
    keywords: ["fibre", "fiber", "internet", "wifi", "wi-fi", "adsl", "lte", "uncapped",
      "router", "home fibre", "telkom fibre", "rain fibre", "fibre contract"],
    brands: ["vumatel", "openserve", "webafrica", "afrihost", "mweb", "cool ideas", "frogfoot",
      "octotel", "metrofibre", "herotel", "starlink", "axxess", "vox"],
  },
  {
    slug: "utilities_mobile", parent: "bills", label: "Mobile / airtime",
    keywords: ["airtime", "data bundle", "data bundles", "prepaid data", "prepaid airtime",
      "airtime top up", "data top up", "cellphone contract", "phone contract", "cell phone bill",
      "cellphone bill", "phone bill", "sim card", "rain mobile", "rain 5g"],
    brands: ["vodacom", "mtn", "telkom", "cell c", "cellc", "lebara", "fnb connect"],
    weak: ["data", "sim", "rain", "contract", "recharge"],
  },
  {
    slug: "utilities_tv", parent: "bills", label: "DSTV / TV licence",
    keywords: ["tv licence", "tv license", "explora", "satellite tv"],
    brands: ["dstv", "multichoice", "sabc", "gotv", "openview", "starsat"],
  },
  {
    slug: "bills_insurance", parent: "bills", label: "Insurance",
    keywords: ["insurance", "car insurance", "vehicle insurance", "home insurance",
      "household insurance", "contents insurance", "building insurance", "buildings insurance",
      "life cover", "life insurance", "funeral cover", "funeral policy", "insurance premium",
      "monthly premium", "insurance excess", "travel insurance", "pet insurance"],
    brands: ["outsurance", "santam", "miway", "king price", "budget insurance", "dialdirect",
      "dial direct", "hollard", "old mutual", "sanlam", "liberty life", "1life", "clientele",
      "discovery insure", "naked insurance", "pineapple insurance", "auto & general",
      "first for women", "assupol", "avbob"],
    weak: ["policy", "premium"],
  },
  {
    slug: "bills_medical", parent: "bills", label: "Medical aid",
    keywords: ["medical aid", "medical scheme", "hospital plan", "gap cover"],
    brands: ["discovery health", "momentum health", "bonitas", "medshield", "fedhealth",
      "gems medical", "bestmed", "medihelp", "profmed", "keyhealth", "polmed", "sizwe hosmed"],
    weak: ["discovery", "vitality"],
  },
  {
    slug: "bills_debt", parent: "bills", label: "Loans & credit",
    keywords: ["loan", "loan repayment", "personal loan", "credit card", "credit card payment",
      "store card", "store account", "clothing account", "instalment", "installment",
      "edgars account", "truworths account", "debt repayment", "debt review"],
    brands: ["payjustnow", "pay just now", "payflex", "mobicred", "happy pay"],
  },
  {
    slug: "entertainment_streaming", parent: "bills", label: "Streaming & subscriptions",
    keywords: ["apple music", "apple tv", "apple one", "youtube premium", "youtube music",
      "amazon prime", "prime video", "google one", "disney plus", "hbo max", "paramount plus",
      "chatgpt plus", "microsoft 365", "office 365", "kindle unlimited", "showmax pro",
      "streaming service"],
    brands: ["netflix", "spotify", "showmax", "disney", "audible", "icloud", "dropbox",
      "patreon", "paramount", "britbox", "deezer", "tidal", "chatgpt", "openai", "canva",
      "duolingo", "crunchyroll", "mubi", "adobe"],
    weak: ["subscription", "subscriptions", "streaming"],
  },
  {
    slug: "utilities", parent: "bills", label: "Utilities (other)",
    keywords: ["gas", "lpg", "lpg gas", "gas refill", "gas bottle", "gas cylinder", "utility",
      "utilities", "paraffin"],
    brands: ["easigas", "afrox", "totalgaz"],
  },
  {
    slug: "bills", parent: "bills", label: "Bill (other)", keywords: [],
    weak: ["bill", "bills", "debit order", "monthly bill"],
  },

  // --- Eating out ---
  {
    slug: "eatingout_takeaway", parent: "eatingout", label: "Takeaway / delivery",
    keywords: ["takeaway", "takeaways", "take-away", "take away", "takeout", "fast food",
      "food delivery", "pizza delivery", "drive thru", "drive through", "bunny chow", "kota",
      "gatsby", "fish and chips", "fish & chips", "shawarma", "shwarma", "hot dog", "hot dogs"],
    brands: ["uber eats", "ubereats", "mr d", "mr d food", "mr delivery", "mrd", "bolt food",
      "kfc", "nandos", "nando's", "steers", "debonairs", "roman's pizza", "romans pizza",
      "chicken licken", "mcdonalds", "mcdonald's", "macdonalds", "burger king", "wimpy",
      "fishaways", "king pie", "pedros", "galitos", "barcelos", "hungry lion", "pizza hut",
      "dominos", "domino's", "simply asia", "anat", "subway", "pizza perfect", "mochachos",
      "chesa nyama", "shisanyama", "shisa nyama"],
    weak: ["pie", "pies", "delivery"],
  },
  {
    slug: "eatingout_coffee", parent: "eatingout", label: "Coffee & café",
    keywords: ["cafe", "coffee shop", "coffee out", "coffee date", "coffee with", "cappuccino",
      "latte", "flat white", "americano", "espresso", "macchiato", "cortado", "babyccino",
      "chai latte", "mochaccino", "iced coffee", "hot chocolate", "coffee and cake",
      "high tea"],
    brands: ["vida", "vida e caffe", "seattle coffee", "starbucks", "bootlegger",
      "mugg and bean", "mugg & bean", "mugg n bean", "wild bean", "wild bean cafe",
      "motherland coffee", "father coffee", "truth coffee", "origin coffee", "tribe coffee",
      "house of coffees"],
  },
  {
    slug: "eatingout_drinks", parent: "eatingout", label: "Bars & drinks",
    keywords: ["pub", "tavern", "shebeen", "cocktail", "cocktails", "brewery", "bar tab",
      "round of drinks", "drinks", "nightclub", "night out", "shots", "pint", "pints",
      "beer garden", "wine bar", "rooftop bar", "happy hour", "sundowners"],
    weak: ["bar", "tab", "club", "jol", "lounge"],
  },
  {
    slug: "eatingout_restaurant", parent: "eatingout", label: "Restaurant",
    keywords: ["restaurant", "dinner out", "lunch out", "breakfast out", "brunch out",
      "date night", "sit down meal", "eating out", "meal out", "set menu", "tasting menu",
      "fine dining", "sushi", "sushi bar", "pizza", "pizzeria", "burger", "burgers",
      "steakhouse", "waiter", "waiter tip", "buffet", "carvery", "dim sum", "ramen", "tapas",
      "bistro", "trattoria", "goulash", "langos", "pierogi", "paprikash"],
    brands: ["spur", "ocean basket", "col'cacchio", "colcacchio", "panarottis", "the hussar",
      "hussar grill", "rocomamas", "tashas", "kauai", "john dory's", "john dorys", "cappello",
      "news cafe", "primi piatti", "turn n tender", "turn 'n tender", "rj's", "black steer",
      "beefcakes", "doppio zero", "the grillhouse", "marble"],
    weak: ["dinner", "lunch", "breakfast", "brunch", "tip", "curry", "grill",
      "aandete", "middagete", "ontbyt", "brekkie", "brekky", "brekki"],
  },
  {
    slug: "eatingout", parent: "eatingout", label: "Eating out (other)", keywords: [],
    weak: ["meal", "meals", "food out"],
  },

  // --- Transport ---
  {
    slug: "transport_rideshare", parent: "transport", label: "Uber / Bolt / taxi",
    keywords: ["taxi", "e-hailing", "ehailing", "lift club", "uber ride", "uber trip"],
    brands: ["uber", "bolt", "indriver", "in driver", "didi", "yango"],
    weak: ["cab", "ride", "lift"],
  },
  {
    slug: "transport_fuel", parent: "transport", label: "Fuel / petrol",
    keywords: ["petrol", "fuel", "diesel", "unleaded", "fill up", "fill-up", "fuel up",
      "tank of petrol", "petrol money", "fuel money", "petrol contribution", "fuel card"],
    brands: ["engen", "shell", "bp", "sasol", "totalenergies", "total energies", "total garage",
      "total petrol", "caltex", "astron", "astron energy", "puma energy"],
    weak: ["garage"],
  },
  {
    slug: "transport_parking", parent: "transport", label: "Parking, tolls & fines",
    keywords: ["parking", "parkade", "parking ticket", "parking fee", "parking meter",
      "airport parking", "car guard", "e-toll", "etoll", "toll", "tolls", "toll gate",
      "toll fee", "toll road", "boom gate", "traffic fine", "speeding fine", "speeding ticket",
      "parking fine", "valet parking"],
    brands: ["sanral", "paycity", "aarto"],
    weak: ["fine", "fines"],
  },
  {
    slug: "transport_public", parent: "transport", label: "Gautrain / public",
    keywords: ["bus", "buses", "bus fare", "bus ticket", "train", "train ticket", "shuttle",
      "airport shuttle", "airport transfer", "minibus", "minibus taxi", "kombi", "taxi fare",
      "taxi rank", "ferry", "gautrain card", "intercity bus", "coach ticket"],
    brands: ["gautrain", "myciti", "my citi", "rea vaya", "reavaya", "a re yeng", "areyeng",
      "go george", "metrobus", "putco", "golden arrow", "intercape", "translux", "citiliner",
      "metrorail", "prasa", "shosholoza meyl"],
  },
  {
    slug: "transport_car", parent: "transport", label: "Car service & upkeep",
    keywords: ["car service", "car wash", "carwash", "tyre", "tyres", "tire", "tires",
      "licence disc", "license disc", "car licence", "vehicle licence", "mechanic", "panelbeat",
      "panelbeater", "panel beater", "car battery", "engine oil", "oil change",
      "wheel alignment", "wheel balancing", "roadworthy", "brake pads", "brakes", "windscreen",
      "car parts", "auto parts", "spare parts", "car repair", "car maintenance", "service plan",
      "aa membership", "automobile association", "vehicle tracker", "car tracker"],
    brands: ["midas", "autozone", "goldwagen", "tiger wheel", "supa quick", "supaquick",
      "hi-q", "bridgestone", "dunlop", "pg glass", "glasfit", "cartrack", "netstar"],
  },
  {
    slug: "transport", parent: "transport", label: "Transport (other)",
    keywords: ["car", "car payment", "car instalment", "vehicle finance", "car finance"],
    weak: ["vehicle", "commute", "transport"],
  },

  // --- Groceries (the big vocabulary lives on the general supermarket bucket) ---
  {
    slug: "groceries_liquor", parent: "groceries", label: "Liquor",
    keywords: ["liquor", "liquor store", "liquorshop", "bottle store", "bottlestore",
      "tops at spar", "spar tops", "makro liquor", "checkers liquor", "checkers liquorshop",
      "pick n pay liquor", "wine", "red wine", "white wine", "bubbly", "champagne", "prosecco",
      "sparkling wine", "beer", "beers", "lager", "craft beer", "cider", "ciders", "whisky",
      "whiskey", "vodka", "gin", "rum", "brandy", "tequila", "jagermeister", "sherry",
      "spirits", "alcohol", "booze", "six pack", "case of beer", "crate of beer", "wine case"],
    brands: ["norman goodfellows", "ultra liquors", "liquor city", "amarula", "klipdrift",
      "klippies", "jameson", "johnnie walker", "jack daniels", "smirnoff", "absolut", "bacardi",
      "captain morgan", "savanna", "hunters dry", "hunters gold", "castle", "castle lite",
      "black label", "carling", "heineken", "windhoek", "amstel", "stella artois", "corona",
      "flying fish", "brutal fruit", "redds"],
    weak: ["tops", "dop", "mcc"],
  },
  {
    slug: "groceries_butcher", parent: "groceries", label: "Meat & butcher",
    keywords: ["butcher", "butchery", "meat market", "braai pack", "braaipack", "braai meat",
      "braai", "chops", "lamb chops", "pork chops", "ribs", "spare ribs", "t-bone", "rump", "sirloin",
      "brisket", "pork belly", "charcuterie", "biltong", "droewors", "drywors", "game meat"],
    weak: ["deli", "meat"],
  },
  {
    slug: "groceries_consumables", parent: "groceries", label: "Household consumables",
    keywords: ["toilet paper", "toilet roll", "toilet rolls", "loo roll", "cleaning supplies",
      "cleaning products", "dishwash", "dishwashing liquid", "dish soap", "washing powder",
      "washing liquid", "laundry detergent", "detergent", "fabric softener",
      "fabric conditioner", "sunlight liquid", "handy andy", "domestos", "jik", "bleach",
      "mr muscle", "doom", "baygon", "air freshener", "glade", "cling wrap", "cling film", "foil",
      "tin foil", "aluminium foil", "bin bags", "refuse bags", "black bags", "garbage bags",
      "paper towel", "paper towels", "kitchen towel", "serviettes", "napkins", "tissues",
      "sponges", "steel wool", "scourer", "dishwasher tablets", "finish tablets",
      "surface spray", "disinfectant", "dettol", "omo", "ariel", "maq", "sta-soft", "vanish",
      "batteries", "battery", "candles", "rat poison", "ant poison", "insect spray", "firelighters", "charcoal", "firewood", "braai wood", "braaihout"],
    weak: ["wood"],
  },
  {
    slug: "groceries", parent: "groceries", label: "Supermarket",
    // Naming the bucket outright outweighs any one item: "groceries and wine".
    brands: ["groceries", "grocery", "grocer"],
    keywords: [...GROCERY_WORDS, ...GROCERY_BRANDS, "woolies food", "woolworths food",
      "checkers sixty60", "sixty60", "pnp asap"],
    weak: ["food", "shopping", "kos"],
    retailers: ["woolworth", "woolworths", "woolies", "checkers", "checkers hyper",
      "pick n pay", "pick 'n pay", "picknpay", "pnp", "spar", "superspar", "kwikspar",
      "shoprite", "usave", "boxer", "food lover's", "food lovers", "food lover",
      "fruit & veg", "fruit and veg", "fruit & veg city", "ok foods", "ok grocer", "makro",
      "cambridge", "president hyper", "food store", "choppies", "game food"],
  },

  // --- Household ---
  {
    slug: "household_cleaning", parent: "household", label: "Cleaning & domestic help",
    keywords: ["domestic", "domestic worker", "domestic helper", "domestic wages", "maid",
      "housekeeper", "cleaner", "cleaners", "cleaning lady", "cleaning service", "deep clean",
      "house cleaning", "laundry service", "laundromat", "dry cleaning", "dry cleaner",
      "dry cleaners", "ironing", "gardener", "gardener wages"],
    brands: ["sweepsouth", "sweep south"],
    weak: ["helper", "char", "laundry"],
  },
  {
    slug: "household_security", parent: "household", label: "Security & armed response",
    keywords: ["security", "armed response", "security company", "security guard",
      "night guard", "alarm", "alarm system", "alarm monitoring", "beams", "cctv",
      "security camera", "electric fence", "electric fencing", "panic button",
      "access control", "estate security", "neighbourhood watch", "community patrol"],
    brands: ["adt", "fidelity adt", "fidelity", "chubb", "beagle watch", "6th sense",
      "protea coin", "g4s", "blue security"],
    weak: ["guard"],
  },
  {
    slug: "household_maintenance", parent: "household", label: "Maintenance & hardware",
    keywords: ["hardware", "hardware store", "plumber", "plumbing", "electrician", "handyman",
      "tools", "toolbox", "drill", "repairs", "geyser", "paint", "painter", "light bulb",
      "light bulbs", "globes", "extension cord", "leaking tap", "tap washer", "pipes",
      "blocked drain", "roofing", "roof repair", "gutter", "gutters", "tiles", "tiling", "grout",
      "cement", "bricks", "timber", "screws", "screws and nails", "bolts", "nuts and bolts",
      "silicone", "sealant", "locksmith", "key cutting", "gate remote", "garage door", "gate motor",
      "gate repair", "pest control", "fumigation", "borehole", "pool maintenance",
      "pool chemicals", "pool pump", "pool cleaning", "chlorine", "solar panel", "solar panels",
      "inverter", "battery backup", "backup battery", "generator", "jojo tank", "water tank",
      "aircon", "air conditioner", "damp proofing", "waterproofing", "renovation",
      "renovations", "contractor", "multi plug", "extension lead", "plug adapter",
      "key copy", "key copies", "spare key", "duplicate key", "super glue"],
    brands: ["builders", "builders warehouse", "builders express", "leroy merlin", "cashbuild",
      "buco", "brights", "chamberlain", "chamberlains", "mica", "timbercity", "build it",
      "pennypinchers", "penny pinchers", "plumblink", "brico", "bricomart", "plascon", "dulux"],
    weak: ["maintenance", "repair", "globe", "lock", "builder", "pool", "toilet", "remote", "keys"],
  },
  {
    slug: "household_furniture", parent: "household", label: "Furniture, décor & appliances",
    keywords: ["furniture", "couch", "sofa", "bed", "mattress", "bed base", "wardrobe",
      "chest of drawers", "dining table", "coffee table", "bookshelf", "shelves", "decor",
      "linen", "bed linen", "towel", "towels", "bath towel", "sheet set", "duvet",
      "duvet cover", "pillow", "pillows", "cushion", "cushions", "curtains", "blinds", "rug",
      "carpet", "lamp", "mirror", "picture frame", "vase", "crockery", "cutlery",
      "dinner plates", "pots and pans", "cookware", "frying pan", "baking tray", "wine glasses",
      "mugs", "storage boxes", "tupperware", "hangers", "laundry basket", "ironing board",
      "kitchen utensils", "utensils", "homeware", "appliance", "appliances", "kettle", "toaster",
      "microwave", "fridge", "refrigerator", "freezer", "washing machine", "tumble dryer",
      "dishwasher", "stove", "oven", "air fryer", "airfryer", "blender", "coffee machine",
      "nespresso machine", "vacuum", "vacuum cleaner", "heater", "electric blanket",
      "slow cooker", "pressure cooker", "food processor"],
    brands: ["coricraft", "mr price home", "mrp home", "@home", "sheet street", "wetherlys",
      "furniture city", "dial-a-bed", "house & home", "homechoice", "home choice", "ikea",
      "loads of living", "weylandts", "block & chisel", "boardmans", "yuppiechef", "hirsch's",
      "defy", "russell hobbs", "kenwood", "smeg", "salton", "sunbeam", "morphy richards",
      "tefal", "le creuset"],
    weak: ["chair", "chairs", "table", "sheets", "iron", "fan", "plates"],
  },
  {
    slug: "household_garden", parent: "household", label: "Garden",
    keywords: ["garden", "gardening", "garden service", "plant", "plants", "nursery", "lawn",
      "lawn mower", "lawnmower", "lawn service", "grass cutting", "compost", "seedlings",
      "seeds", "potting soil", "fertiliser", "fertilizer", "mulch", "plant pots",
      "garden hose", "weed killer", "tree felling", "irrigation", "sprinkler", "bokashi",
      "compost bin", "worm farm"],
    brands: ["stodels", "lifestyle garden", "starke ayres", "plantland"],
    weak: ["soil", "hose", "trees"],
  },
  {
    slug: "household_pharmacy", parent: "household", label: "Pharmacy & toiletries",
    keywords: ["pharmacy", "chemist", "meds", "medication", "medicine", "prescription",
      "cold and flu", "vitamins", "supplements", "antihistamine", "plasters", "first aid kit",
      "toiletries", "toiletry", "shampoo", "conditioner", "deodorant", "deo", "roll on", "toothpaste",
      "toothbrush", "tandeborsel", "tandepasta", "dental floss", "mouthwash", "body wash", "shower gel", "soap", "hand soap",
      "face wash", "moisturiser", "moisturizer", "body lotion", "lotion", "sunscreen",
      "sunblock", "lip balm", "razor", "razors", "shaving cream", "sanitary pads", "tampons",
      "panty liners", "nappies", "diapers", "baby wipes", "wet wipes", "cotton wool",
      "cotton buds", "cosmetics", "makeup", "make-up", "mascara", "lipstick", "skincare",
      "nail polish", "perfume", "fragrance", "cologne", "hair dye", "condoms",
      "contact lens solution", "panado", "disprin", "med-lemon", "grand-pa"],
    brands: ["dis-chem", "dischem", "dis chem", "medirite", "medi rite", "link pharmacy",
      "alpha pharm", "nivea", "vaseline", "colgate", "sensodyne", "gillette", "huggies",
      "pampers", "garnier", "loreal", "l'oreal", "maybelline", "revlon", "the body shop",
      "protex", "lifebuoy", "rexona"],
    weak: ["wipes", "pads", "script"],
    retailers: ["clicks"],
  },
  {
    slug: "household", parent: "household", label: "Household (other)", keywords: [],
    weak: ["supplies", "cleaning", "household", "house stuff", "home stuff"],
  },

  // --- Leisure (was Entertainment; travel/hobbies live here now) ---
  {
    slug: "entertainment_movies", parent: "leisure", label: "Movies & shows",
    keywords: ["movie", "movies", "movie night", "movie tickets", "cinema", "imax", "4dx",
      "drive-in", "theatre", "theater", "musical", "ballet", "opera", "film", "box office"],
    brands: ["ster-kinekor", "ster kinekor", "sterkinekor", "nu metro", "numetro", "nu-metro",
      "the bioscope", "labia", "artscape", "joburg theatre", "montecasino theatre", "theatre on the bay"],
    weak: ["show", "shows"],
  },
  {
    slug: "entertainment_events", parent: "leisure", label: "Events & tickets",
    keywords: ["concert", "gig", "festival", "music festival", "tickets", "events", "expo",
      "comedy show", "comedy club", "stand-up", "live music", "rugby match", "soccer match",
      "cricket match", "match tickets", "game tickets", "stadium"],
    brands: ["computicket", "quicket", "webtickets", "ticketpro", "howler", "ticketmaster",
      "oppikoppi", "afrikaburn", "rocking the daisies"],
    weak: ["ticket", "event"],
  },
  {
    slug: "entertainment_gaming", parent: "leisure", label: "Games",
    keywords: ["video game", "video games", "gaming", "ps5", "ps4", "psn", "ps plus",
      "xbox live", "game pass", "gamepass", "nintendo switch", "in-game", "in game purchase",
      "battle pass", "v-bucks", "vbucks", "fortnite", "ea fc", "call of duty", "roblox",
      "robux", "minecraft", "discord nitro", "steam deck", "console", "gaming chair"],
    brands: ["steam", "playstation", "xbox", "nintendo", "epic games", "twitch", "bt games",
      "btgames", "raru"],
    weak: ["game", "loot", "controller"],
  },
  {
    slug: "entertainment_sport", parent: "leisure", label: "Sport & fitness",
    keywords: ["gym", "gym membership", "crossfit", "parkrun", "sport", "sports", "padel",
      "padel court", "tennis", "golf", "soccer", "football", "rugby", "cricket", "netball", "hockey", "golf club", "golf day", "green fees", "cycling",
      "bicycle", "bike service", "running shoes", "marathon", "race entry", "comrades",
      "two oceans", "cycle tour", "yoga", "pilates", "swimming", "swimming lessons",
      "dance class", "karate", "martial arts", "climbing", "climbing gym", "surfing",
      "surf lessons", "hiking", "protein", "protein powder", "whey", "creatine", "fitness",
      "personal trainer", "pt session"],
    brands: ["virgin active", "planet fitness", "zone fitness", "anytime fitness",
      "sportsmans warehouse", "sportsman's warehouse", "totalsports", "total sports",
      "cape union mart", "outdoor warehouse"],
    weak: ["squash", "running", "boxing"],
  },
  {
    slug: "other_travel", parent: "leisure", label: "Travel & accommodation",
    keywords: ["flight", "flights", "air ticket", "plane ticket", "airline", "hotel",
      "hotel stay", "b&b", "bnb", "bed and breakfast", "lodge", "game lodge", "game drive",
      "safari", "kruger", "kruger park", "wild card", "park fees", "conservation fee", "travel",
      "getaway", "weekend away", "holiday", "vacation", "guesthouse", "guest house",
      "backpackers", "hostel", "resort", "self catering", "car hire", "car rental",
      "rental car", "visa application", "luggage", "suitcase", "road trip", "holiday accommodation",
      "camping", "campsite", "timeshare", "cruise"],
    brands: ["booking.com", "bookingcom", "airbnb", "lekkeslaap", "safarinow", "travelstart",
      "flight centre", "flightcentre", "expedia", "sanparks", "flysafair", "kulula", "safair",
      "airlink", "british airways", "south african airways", "emirates", "qatar airways",
      "ethiopian airlines", "cemair", "avis", "hertz", "europcar", "bidvest car rental",
      "tempest car hire", "woodford car hire", "sun city"],
    weak: ["accommodation", "airport", "trip", "visa"],
  },
  {
    slug: "leisure_hobbies", parent: "leisure", label: "Hobbies & outings",
    keywords: ["hobby", "hobbies", "activities", "crafts", "art supplies", "art class", "pottery",
      "painting class", "sewing", "knitting", "books", "bookstore", "book shop", "kindle",
      "magazine", "magazines", "board game", "chess", "puzzle", "lego", "museum", "zoo", "aquarium",
      "theme park", "water park", "bowling", "putt putt", "mini golf", "escape room",
      "go karting", "go-karts", "paintball", "trampoline park", "picnic", "wine tasting",
      "wine farm", "brewery tour", "botanical garden", "botanical gardens", "day out",
      "photography", "music lessons", "guitar", "piano", "fishing", "fishing licence",
      "party supplies"],
    brands: ["exclusive books", "bargain books", "cna", "two oceans aquarium", "ushaka",
      "gold reef city", "kirstenbosch"],
    weak: ["outing", "activity", "craft", "book", "gallery", "party", "fabric", "wool"],
  },
  {
    slug: "entertainment", parent: "leisure", label: "Leisure (other)", keywords: [],
    weak: ["entertainment", "leisure", "fun"],
  },

  // --- Other ---
  {
    slug: "other_medical", parent: "other", label: "Doctor & medical",
    keywords: ["doctor", "gp", "dentist", "dental", "orthodontist", "hospital", "hospital bill",
      "clinic", "medical", "medical bill", "consultation", "specialist", "radiology", "x-ray",
      "pathology", "blood test", "blood tests", "physio", "physiotherapy", "physiotherapist", "chiropractor",
      "biokinetics", "optometrist", "optometry", "optician", "eye test", "prescription glasses",
      "contact lenses", "psychologist", "counselling", "psychiatrist", "dermatologist", "gynae",
      "gynaecologist", "paediatrician", "pediatrician", "vaccination", "flu shot", "covid test",
      "emergency room", "ambulance", "hearing aid", "ultrasound", "sonar", "mri",
      "teeth cleaning"],
    brands: ["lancet", "ampath", "pathcare", "specsavers", "spec-savers", "netcare",
      "mediclinic", "life healthcare", "er24", "medicross", "intercare"],
    weak: ["therapy", "therapist", "consult", "casualty", "glasses"],
  },
  {
    slug: "other_fees", parent: "other", label: "Bank & fees",
    keywords: ["bank fee", "bank fees", "bank charges", "service fee", "admin fee",
      "monthly account fee", "account fee", "eft fee", "atm fee", "card fee", "interest charge",
      "transaction fee", "cash withdrawal fee", "overdraft", "penalty fee", "late fee",
      "late payment fee", "debit order fee"],
    weak: ["interest", "fnb", "absa", "standard bank", "nedbank", "capitec", "tymebank",
      "discovery bank", "investec", "african bank"],
  },
  {
    slug: "other_admin", parent: "other", label: "Tax, legal & admin",
    keywords: ["sars", "tax return", "efiling", "income tax", "provisional tax", "home affairs",
      "passport", "smart id", "id card", "police clearance", "notary", "attorney", "lawyer",
      "legal fees", "conveyancing", "transfer duty", "accountant", "accounting fees",
      "tax practitioner", "affidavit", "certified copies", "drivers licence",
      "driver's licence", "drivers license", "licence renewal", "license renewal",
      "learners licence"],
    weak: ["tax", "legal", "admin"],
  },
  {
    slug: "other_gifts", parent: "other", label: "Gifts & donations",
    keywords: ["gift", "gifts", "gift card", "gift voucher", "donation", "donate", "charity",
      "birthday present", "birthday gift", "wedding gift", "baby shower", "christmas present",
      "christmas presents", "xmas", "anniversary gift", "flowers", "bouquet", "florist",
      "greeting card", "tithe", "offering", "church", "gift wrap", "wrapping paper",
      "secret santa", "backabuddy"],
    brands: ["netflorist"],
    weak: ["present", "presents", "voucher", "funeral", "collection", "christmas"],
  },
  {
    slug: "other_kids", parent: "other", label: "Kids & school",
    keywords: ["school", "school fees", "creche", "daycare", "day care", "preschool",
      "pre-school", "playschool", "nursery school", "aftercare", "stationery", "textbooks",
      "text books", "school uniform", "uniform", "extra lessons", "tutor", "tutoring",
      "school trip", "school outing", "school shoes", "lunchbox", "school bag", "school supplies",
      "back to school", "pocket money", "babysitter", "babysitting", "nanny", "au pair", "toys",
      "toy", "pram", "car seat", "crayons", "kids party", "tuition", "university fees",
      "varsity", "student fees", "unisa"],
    brands: ["toys r us", "toy kingdom", "baby city"],
    weak: ["kids", "kid", "children", "baby", "toddler", "allowance"],
  },
  {
    slug: "other_pets", parent: "other", label: "Pets",
    keywords: ["pet", "pets", "vet", "vet bill", "veterinary", "veterinarian", "dog food",
      "cat food", "pet food", "pet mince", "dog treats", "cat litter", "kitty litter",
      "petshop", "pet shop", "pet grooming", "dog grooming", "groomer", "kennel", "kennels",
      "cattery", "dog walker", "dog sitter", "pet sitter", "deworm", "flea treatment",
      "tick and flea", "bird seed", "fish food", "poo bags", "poop bags", "kattekos", "hondekos", "dog", "dogs", "cat", "cats", "puppy", "kitten"],
    brands: ["petworld", "pet world", "absolute pets", "bravecto", "nexgard", "royal canin",
      "hill's", "acana", "montego", "bobtail"],
    weak: ["litter", "spca"],
  },
  {
    slug: "other_clothing", parent: "other", label: "Clothing & shoes",
    keywords: ["clothes", "clothing", "shoes", "sneakers", "takkies", "boots", "sandals",
      "slops", "jeans", "trousers", "shirt", "shirts", "t-shirt", "tshirt", "dress", "dresses",
      "skirt", "jacket", "hoodie", "sweater", "socks", "underwear", "bra", "lingerie",
      "pyjamas", "pajamas", "swimsuit", "swimming costume", "bikini", "beanie", "scarf", "belt",
      "handbag", "wallet", "sunglasses", "jewellery", "jewelry", "earrings", "necklace",
      "tailor", "alterations", "woolworths clothing", "woolies clothing"],
    brands: ["mr price", "mrp", "edgars", "jet stores", "truworths", "foschini", "markham",
      "sportscene", "cotton on", "h&m", "zara", "pep stores", "pepstores", "ackermans",
      "studio 88", "superbalist", "shein", "zando", "country road", "trenery", "witchery",
      "levi's", "levis", "nike", "adidas", "puma", "new balance", "asics", "converse", "crocs",
      "skechers", "hi-tec", "under armour", "the north face", "spitz", "aldo", "factorie",
      "relay jeans", "jay jays"],
    weak: ["pants", "shorts", "coat", "jersey", "trainers", "hat", "gloves", "pep"],
  },
  {
    slug: "other_personal", parent: "other", label: "Hair & personal care",
    keywords: ["haircut", "hair cut", "barber", "barbershop", "hairdresser", "salon",
      "hair salon", "nail salon", "nails", "gel nails", "manicure", "pedicure", "mani pedi",
      "lash extensions", "lashes", "brows", "eyebrows", "waxing", "beauty salon", "spa",
      "spa day", "massage", "facial", "hair colour", "hair color", "braids", "braiding",
      "hair treatment", "blow dry", "tattoo", "piercing", "skin clinic", "laser hair removal",
      "botox"],
    brands: ["sorbet", "placecol", "camelot spa", "mangwanani"],
    weak: ["beauty", "wellness", "hair"],
  },
  {
    slug: "other_tech", parent: "other", label: "Electronics & tech",
    keywords: ["electronics", "laptop", "computer", "pc parts", "smartphone", "iphone",
      "samsung galaxy", "ipad", "macbook", "airpods", "earphones", "headphones", "earbuds",
      "bluetooth speaker", "charger", "phone charger", "usb", "hdmi", "power bank", "powerbank",
      "phone case", "screen protector", "printer", "printer ink", "ink cartridge", "toner",
      "monitor", "keyboard", "smart watch", "smartwatch", "apple watch", "smart tv",
      "television", "camera", "gopro", "drone", "hard drive", "ssd", "memory card", "sd card",
      "software", "antivirus", "phone repair", "screen repair", "laptop repair", "apple store",
      "gadget", "gadgets"],
    brands: ["incredible connection", "hifi corp", "hi-fi corp", "istore", "computer mania",
      "evetech", "wootware", "dion wired", "samsung", "huawei", "xiaomi", "oppo", "lenovo",
      "dell", "asus", "acer", "logitech", "jbl", "bose", "sonos", "fitbit", "garmin"],
    weak: ["phone", "cellphone", "tv", "speaker", "cable", "mouse", "pc", "tablet"],
  },
  {
    slug: "other_shopping", parent: "other", label: "Online & general shopping",
    keywords: ["online shopping", "online order", "courier", "postage", "post office",
      "facebook marketplace"],
    brands: ["postnet", "the courier guy", "pargo", "aramex", "paxi", "pudo", "aliexpress",
      "ebay", "gumtree", "bob shop", "bobshop", "onedayonly", "one day only"],
    weak: ["marketplace", "order", "parcel"],
    retailers: ["takealot", "amazon", "temu", "game stores", "hyperama"],
  },
  { slug: "other_insurance", parent: "bills", label: "Insurance", keywords: [], legacy: true },
  {
    slug: "other", parent: "other", label: "Other", keywords: [],
    weak: ["misc", "miscellaneous", "sundries", "random"],
  },
];

const SUB_BY_SLUG = new Map(SUBCATEGORIES.map((s) => [s.slug, s]));

/**
 * Parent → its pickable subcategories, in registry order (for the picker +
 * reports). Legacy aliases are left out: `other_insurance` used to put a
 * second "Insurance" chip under Bills.
 */
export const CATEGORY_TREE: Record<ParentCategory, SubcategoryDef[]> = PARENT_CATEGORIES.reduce(
  (acc, p) => {
    acc[p] = SUBCATEGORIES.filter((s) => s.parent === p && !s.legacy);
    return acc;
  },
  {} as Record<ParentCategory, SubcategoryDef[]>
);

/** Resolve any stored slug to its parent (legacy bare slugs → themselves). */
export function parentOf(slug: Category): ParentCategory {
  const sub = SUB_BY_SLUG.get(slug);
  if (sub) return sub.parent;
  if ((PARENT_CATEGORIES as string[]).includes(slug)) return slug as ParentCategory;
  const head = slug.split("_")[0];
  if ((PARENT_CATEGORIES as string[]).includes(head)) return head as ParentCategory;
  return "other";
}

/** Display info for any stored slug: subcategory label + parent colour/icon. */
export function categoryMeta(slug: Category): {
  label: string;
  parent: ParentCategory;
  parentLabel: string;
  color: string;
  icon: string;
  codepoint: string;
} {
  const parent = parentOf(slug);
  const pm = CATEGORY_META[parent];
  const sub = SUB_BY_SLUG.get(slug);
  return {
    label: sub ? sub.label : pm.label,
    parent,
    parentLabel: pm.label,
    color: pm.color,
    icon: pm.icon,
    codepoint: pm.codepoint,
  };
}

// ===========================================================================
// Matcher engine
// ===========================================================================

type Tier = "brand" | "keyword" | "weak" | "retailer";

/** Evidence weights per tier (single word). Phrases add a word each, +1. */
export const TIER_WEIGHT: Record<Tier, number> = { brand: 2, keyword: 1, weak: 0.75, retailer: 0.5 };
/** A typo hit is worth this fraction of a clean one, so it never beats it. */
const FUZZY_DISCOUNT = 0.75;
/** Minimum word length before one-letter typos are tolerated. */
const FUZZ_MIN: Record<Tier, number> = { brand: 6, retailer: 6, keyword: 7, weak: Infinity };

interface CompiledKw {
  tier: Tier;
  tokens: string[];
  /** All separators removed — "ster-kinekor" → "sterkinekor". */
  squash: string;
  /** Short punctuated keywords ("@home") where the punctuation is the signal. */
  literal: string | null;
  weight: number;
  fuzzMin: number;
}

function normalise(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokenise(s: string): string[] {
  return s.split(/[^a-z0-9]+/).filter(Boolean);
}

function compileKw(raw: string, tier: Tier): CompiledKw {
  const lower = normalise(raw).trim();
  const tokens = tokenise(lower);
  const squash = tokens.join("");
  const literal = tokens.length === 1 && squash.length < 5 && /[^a-z0-9\s]/.test(lower) ? lower : null;
  const phrase = tokens.length > 1;
  const weight =
    tier === "retailer" || tier === "weak"
      ? TIER_WEIGHT[tier]
      : tokens.length + (tier === "brand" || phrase ? 1 : 0);
  return { tier, tokens, squash, literal, weight, fuzzMin: phrase ? Infinity : FUZZ_MIN[tier] };
}

const COMPILED = SUBCATEGORIES.map((sub) => {
  const kws: CompiledKw[] = [];
  for (const k of sub.brands ?? []) kws.push(compileKw(k, "brand"));
  for (const k of sub.keywords) kws.push(compileKw(k, "keyword"));
  for (const k of sub.weak ?? []) kws.push(compileKw(k, "weak"));
  for (const k of sub.retailers ?? []) kws.push(compileKw(k, "retailer"));
  return { slug: sub.slug, kws: kws.filter((k) => k.tokens.length > 0) };
});

/**
 * Every word the library knows exactly. Such a token is only ever read as
 * itself — never as another keyword's plural, prefix, or typo.
 */
const KNOWN_WORDS = new Set(
  COMPILED.flatMap((c) => c.kws.filter((k) => k.tokens.length === 1).map((k) => k.tokens[0]))
);

interface MatchCtx {
  lower: string;
  tokens: string[];
  squash: string;
  /** squash offset → index of the token starting / ending there. */
  starts: Map<number, number>;
  ends: Map<number, number>;
}

/**
 * Undo emphasis spelling: a letter typed three or more times in a row
 * ("driiinks", "spicessss") becomes one, or two when only that is a word the
 * library knows. Real doubles ("coffee", "bottle") are never touched.
 */
function unstretch(t: string): string {
  if (!/([a-z])\1\1/.test(t)) return t;
  const one = t.replace(/([a-z])\1{2,}/g, "$1");
  const two = t.replace(/([a-z])\1{2,}/g, "$1$1");
  return !KNOWN_WORDS.has(one) && KNOWN_WORDS.has(two) ? two : one;
}

function buildCtx(desc: string | null | undefined): MatchCtx {
  const lower = normalise(desc ?? "");
  const tokens = tokenise(lower).map(unstretch);
  const starts = new Map<number, number>();
  const ends = new Map<number, number>();
  let offset = 0;
  tokens.forEach((t, i) => {
    starts.set(offset, i);
    offset += t.length;
    ends.set(offset, i);
  });
  return { lower, tokens, squash: tokens.join(""), starts, ends };
}

/** Bounded Levenshtein: true iff edit distance between a and b is ≤ 1. */
function editWithin1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length > b.length) return editWithin1(b, a);
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++edits > 1) return false;
      if (a.length === b.length) i++;
      j++;
    }
  }
  return edits + (b.length - j) <= 1;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);

/**
 * Where `sq` appears in the squashed text on whole-token boundaries (a trailing
 * plural "s"/"es" allowed). Returns the token index span of each occurrence.
 */
function squashOccurrences(ctx: MatchCtx, sq: string): number[][] {
  const out: number[][] = [];
  for (let p = ctx.squash.indexOf(sq); p !== -1; p = ctx.squash.indexOf(sq, p + 1)) {
    const si = ctx.starts.get(p);
    if (si === undefined) continue;
    const end = p + sq.length;
    const ei =
      ctx.ends.get(end) ??
      (ctx.squash[end] === "s" ? ctx.ends.get(end + 1) : undefined) ??
      (ctx.squash.startsWith("es", end) ? ctx.ends.get(end + 2) : undefined);
    if (ei !== undefined) out.push(range(si, ei));
  }
  return out;
}

const isPluralOf = (t: string, w: string) => t === w + "s" || t === w + "es";

/** Token-index spans this keyword covers in the text, and whether by typo. */
function matchKw(ctx: MatchCtx, kw: CompiledKw): { spans: number[][]; fuzzy: boolean } | null {
  if (kw.literal !== null) {
    if (!ctx.lower.includes(kw.literal)) return null;
    const i = ctx.tokens.indexOf(kw.tokens[0]);
    return { spans: [i === -1 ? [] : [i]], fuzzy: false };
  }

  if (kw.tokens.length > 1) {
    const n = kw.tokens.length;
    const last = kw.tokens[n - 1];
    const spans: number[][] = [];
    for (let i = 0; i + n <= ctx.tokens.length; i++) {
      let ok = true;
      for (let j = 0; j < n && ok; j++) {
        const t = ctx.tokens[i + j];
        ok = t === kw.tokens[j] || (j === n - 1 && isPluralOf(t, last));
      }
      if (ok) spans.push(range(i, i + n - 1));
    }
    if (spans.length === 0 && kw.squash.length >= 5) spans.push(...squashOccurrences(ctx, kw.squash));
    return spans.length ? { spans, fuzzy: false } : null;
  }

  const w = kw.tokens[0];
  const exact: number[][] = [];
  ctx.tokens.forEach((t, i) => {
    if (t === w) exact.push([i]);
    else if (!KNOWN_WORDS.has(t) && (isPluralOf(t, w) || (w.length >= 6 && t.startsWith(w)))) exact.push([i]);
  });
  if (exact.length) return { spans: exact, fuzzy: false };

  // Typed with separators: "net flix", "sweep south".
  if (w.length >= 6) {
    const joined = squashOccurrences(ctx, w).filter((s) => s.length > 1);
    if (joined.length) return { spans: joined, fuzzy: false };
  }

  if (w.length >= kw.fuzzMin) {
    const fuzzy: number[][] = [];
    ctx.tokens.forEach((t, i) => {
      if (t.length >= kw.fuzzMin - 1 && !KNOWN_WORDS.has(t) && !/\d/.test(t) && editWithin1(t, w)) {
        fuzzy.push([i]);
      }
    });
    if (fuzzy.length) return { spans: fuzzy, fuzzy: true };
  }
  return null;
}

/** One subcategory's evidence: each token credited once, at its strongest reading. */
function scoreSub(ctx: MatchCtx, kws: CompiledKw[]): number {
  const hits: { w: number; span: number[] }[] = [];
  for (const kw of kws) {
    const m = matchKw(ctx, kw);
    if (!m) continue;
    const w = m.fuzzy ? kw.weight * FUZZY_DISCOUNT : kw.weight;
    for (const span of m.spans) hits.push({ w, span });
  }
  if (hits.length === 0) return 0;
  hits.sort((a, b) => b.w - a.w || b.span.length - a.span.length);
  const claimed = new Set<number>();
  let score = 0;
  for (const h of hits) {
    if (h.span.some((i) => claimed.has(i))) continue;
    h.span.forEach((i) => claimed.add(i));
    score += h.w;
  }
  return score;
}

export interface CategoryScore {
  /** The winner, or "other" when nothing matched. */
  slug: Category;
  score: number;
  /** Second-best score (equal to `score` on a tie). */
  runnerUp: number;
  /** Up to three best-scoring subcategories, strongest first — for an "is it one of these?" row. */
  candidates: { slug: Category; score: number }[];
}

/**
 * Phase 18 §3: a guess counts as confident at this score with at least this
 * lead over the runner-up. Below it the engine is choosing between near-equal
 * readings. Named, not inline: these get tuned against real data.
 */
export const CONFIDENT_MIN_SCORE = 2;
export const CONFIDENT_MIN_MARGIN = 1;

export function isConfident(s: Pick<CategoryScore, "score" | "runnerUp">): boolean {
  return s.score >= CONFIDENT_MIN_SCORE && s.score - s.runnerUp >= CONFIDENT_MIN_MARGIN;
}

/**
 * Each parent's catch-all bucket, plus Other. `groceries` doubles as
 * Supermarket but is still the bare parent slug the old matcher fell back
 * to, so it counts here (ADR-0019).
 */
const GENERAL_SLUGS = new Set<Category>([
  "other", "bills", "utilities", "eatingout", "transport", "groceries", "household", "entertainment",
]);

/**
 * True for a slug that says little about what was bought: Other, a parent's
 * "(other)" bucket, or a slug the registry doesn't know (it displays as its
 * parent). These are the rows a backfill may re-file.
 */
export function isGeneralCategory(slug: Category): boolean {
  return GENERAL_SLUGS.has(slug) || !SUB_BY_SLUG.has(slug);
}

/**
 * Score every subcategory against a description. `autoCategory` is the
 * winner; `score`, `runnerUp` and `candidates` let the UI tell a confident
 * guess from a coin-flip (Phase 18 §3).
 */
export function scoreCategory(description: string | null | undefined): CategoryScore {
  const ctx = buildCtx(description);
  if (ctx.tokens.length === 0) return { slug: "other", score: 0, runnerUp: 0, candidates: [] };
  const ranked = COMPILED.map((c, order) => ({ slug: c.slug, score: scoreSub(ctx, c.kws), order }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  return {
    slug: ranked[0]?.slug ?? "other",
    score: ranked[0]?.score ?? 0,
    runnerUp: ranked[1]?.score ?? 0,
    candidates: ranked.slice(0, 3).map(({ slug, score }) => ({ slug, score })),
  };
}

/** Auto-detect a subcategory slug from a free-text description ("other" if nothing matches). */
export function autoCategory(description: string | null | undefined): Category {
  return scoreCategory(description).slug;
}
