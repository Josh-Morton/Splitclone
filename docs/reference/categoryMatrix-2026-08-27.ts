/**
 * Two-level expense categorisation (Phase 6, ADR-0011; parents reworked
 * 2026-07-19 per Josh — fewer, more intuitive top-level buckets + a much
 * larger keyword database; matcher engine rebuilt 2026-08-27 per Josh —
 * scoring instead of first-match-wins, separator/accent normalisation,
 * retailer-vs-brand weighting, and bounded fuzzy typo tolerance).
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
 * WHY THE ENGINE CHANGED
 * ----------------------
 * The old matcher walked the registry and returned the FIRST subcategory whose
 * raw-substring keyword appeared in the text. Two structural problems:
 *
 *   1. Order was load-bearing. "uber eats" only beat "uber" because takeaway
 *      happened to be listed before transport. Any reordering silently changed
 *      results, and a single generic keyword anywhere could hijack a strong
 *      signal that appeared later.
 *   2. Punctuation was literal. "ster-kinekor" was stored hyphenated, so a user
 *      typing "ster kinekor" (space) matched NOTHING and fell through to
 *      "other" — the exact cinema example this system is supposed to nail.
 *
 * The new matcher (see `autoCategory`) SCORES every subcategory and takes the
 * best, so priority comes from evidence strength, not list position:
 *
 *   • Text is normalised: lower-cased, accents stripped ("café"→"cafe"),
 *     tokenised, and also "squashed" (all separators removed) so hyphen / space
 *     / apostrophe variants unify — "ster kinekor" == "ster-kinekor" ==
 *     "sterkinekor", "e-toll" == "e toll", "pick 'n pay" == "pick n pay".
 *   • Each matched keyword contributes a WEIGHT by specificity: multi-word
 *     phrases and distinctive brands score high; generic multi-category
 *     RETAILER names (Checkers, PnP, Woolworths, Makro…) score LOW, so a
 *     specific item inside a store wins — "wine at checkers" → Liquor, not a
 *     bare supermarket line.
 *   • Distinctive brand tokens (≥5 chars) also match within Levenshtein-1, so
 *     "netflx", "nandoos", "woolies" typos still land. Fuzzy hits are
 *     discounted vs exact so they never beat a clean match.
 *   • Ties fall back to registry order (the old priority intent is preserved
 *     purely as a tie-breaker).
 *
 * Storage: expense.category is free text; slugs stored as-is. Legacy slugs
 * (incl. the retired "rent"/"utilities"/"entertainment" parents) still resolve
 * because they remain in the registry, re-parented to their new home. No
 * migration. Public API is unchanged — `autoCategory(desc): Category`.
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

interface SubcategoryDef {
  slug: string;
  parent: ParentCategory;
  label: string;
  /** Substring keywords for auto-detection (lowercase). Empty = the "general" bucket. */
  keywords: string[];
}

// Reusable keyword blocks -----------------------------------------------------

// A big everyday-groceries vocabulary: SA retailers + common items/ingredients.
// This is the "huge database of words" so "cheese", "chicken", "bread" etc all
// land on Groceries automatically. Note: leading/trailing spaces are no longer
// needed for word-boundary safety (the engine tokenises), but are harmless and
// left in place for a handful of short/ambiguous stems.
const GROCERY_WORDS = [
  // retailers (LOW weight — see RETAILER_BRANDS; a specific item overrides them)
  "grocer", "groceries", "supermarket", "woolworth", "woolies", "checkers", "pick n pay",
  "pick 'n pay", "pnp", "spar", "shoprite", "usave", "boxer", "food lover", "food lovers",
  "fruit & veg", "fruit and veg", "ok foods", "ok grocer", "makro", "cambridge",
  "president hyper", "game food", "food store",
  // staples & pantry
  "food", "milk", "long life milk", "bread", "loaf", "eggs", "egg", "butter", "margarine",
  "cheese", "cheddar", "gouda", "feta", "mozzarella", "cream cheese", "yoghurt", "yogurt",
  "cream", "amasi", "maas", "rice", "pasta", "spaghetti", "macaroni", "noodles", "two minute",
  "flour", "cake flour", "maize", "mielie meal", "maize meal", "pap", "samp", "oats",
  "cereal", "weetbix", "pronutro", "cornflakes", "muesli", "sugar", "brown sugar", "salt",
  "spice", "spices", "cooking oil", "olive oil", "sunflower oil", "vinegar", "tomato sauce",
  "ketchup", "mayo", "mayonnaise", "mustard", "chutney", "jam", "honey", "peanut butter",
  "marmite", "bovril", "stock cube", "gravy", "soup", "two-minute noodles",
  // meat & protein
  "chicken", "chicken breast", "beef", "mince", "steak", "pork", "lamb", "sausage",
  "boerewors", "wors", "bacon", "ham", "polony", "viennas", "russians", "fish", "hake",
  "tuna", "salmon", "kingklip", "prawns",
  // produce
  "vegetables", "veggies", "veg", "fruit", "apple", "banana", "orange", "naartjie", "grapes",
  "berries", "strawberr", "blueberr", "tomato", "potato", "sweet potato", "onion", "carrot",
  "lettuce", "spinach", "cabbage", "broccoli", "cauliflower", "cucumber", "butternut",
  "avocado", "avo", "garlic", "ginger", "lemon", "lime", "mushroom", "corn", "mielies",
  "beans", "lentils", "chickpeas", "peas",
  // bakery / snacks / drinks
  "bakery", "roll", "bun", "cake", "muffin", "croissant", "biscuit", "cookies", "rusks",
  "chocolate", "sweets", "candy", "snacks", "nuts", "biltong", "droëwors", "drywors",
  "popcorn", "chips", "crisps", "simba", "nik naks", "ice cream", "juice", "cooldrink",
  "cold drink", "cooldrinks", "soda", "fizzy", "coke", "fanta", "sprite", "coffee", "tea",
  "rooibos", "five roses", "sparkling water", "bottled water", "still water", "energy drink",
  "red bull", "monster",
  // baking / household-food / misc
  "baking powder", "yeast", "vanilla", "cocoa", "icing sugar", "custard", "canned", "tinned",
  "koo", "baby food", "formula", "nappies food", "pet mince",
];

/**
 * Ordered subcategory registry. With the new scoring engine, order is only a
 * TIE-BREAKER (earlier wins on equal score); it no longer drives detection, so
 * you can add keywords freely without worrying about position.
 *
 * Each parent's "general" bucket (slug === parent) carries no keywords and is
 * the manual/fallback choice; legacy rows land here too.
 */
export const SUBCATEGORIES: SubcategoryDef[] = [
  // --- Bills & rent (the "monthly expenses" bucket). Legacy rent_/utilities_
  //     slugs live here now. ---
  { slug: "rent", parent: "bills", label: "Rent / bond", keywords: ["rent", "bond", "bond repayment", "lease", "accommodation", "airbnb", "monthly rent"] },
  { slug: "rent_levies", parent: "bills", label: "Levies & rates", keywords: ["levy", "levies", "rates", "rates and taxes", "body corporate", "hoa", "sectional title"] },
  { slug: "rent_deposit", parent: "bills", label: "Deposit", keywords: ["deposit", "damage deposit", "rental deposit"] },
  { slug: "utilities_electricity", parent: "bills", label: "Electricity / prepaid", keywords: ["electric", "electricity", "prepaid electric", "prepaid electricity", "prepaid", "eskom", "city power", "load shedding", "loadshedding", "kwh", "units electricity"] },
  { slug: "utilities_water", parent: "bills", label: "Water & municipal", keywords: ["water bill", "municipal", "municipality", "rand water", "joburg water", "sanitation", "refuse", "refuse removal", "sewer", "sewerage"] },
  { slug: "utilities_internet", parent: "bills", label: "Internet / fibre", keywords: ["fibre", "fiber", "internet", "wifi", "wi-fi", "adsl", "lte", "uncapped", "vumatel", "openserve", "webafrica", "afrihost", "cool ideas", "mweb", "rain fibre"] },
  { slug: "utilities_mobile", parent: "bills", label: "Mobile / airtime", keywords: ["airtime", "data bundle", "data top up", "top up", "vodacom", "mtn", "telkom", "cell c", "rain", "prepaid data", "sim"] },
  { slug: "utilities_tv", parent: "bills", label: "DSTV / TV licence", keywords: ["dstv", "tv licence", "tv license", "multichoice", "sabc", "explora"] },
  { slug: "bills_insurance", parent: "bills", label: "Insurance", keywords: ["insurance", "car insurance", "home insurance", "life cover", "funeral cover", "outsurance", "santam", "miway", "king price", "budget insurance", "dialdirect", "hollard", "premium"] },
  { slug: "bills_medical", parent: "bills", label: "Medical aid", keywords: ["medical aid", "medical scheme", "discovery health", "momentum health", "bonitas", "medshield", "fedhealth", "gems medical", "gap cover"] },
  { slug: "entertainment_streaming", parent: "bills", label: "Streaming & subscriptions", keywords: ["netflix", "spotify", "showmax", "disney", "disney plus", "apple music", "apple tv", "youtube premium", "amazon prime", "prime video", "audible", "subscription", "icloud", "google one", "dropbox", "patreon"] },
  { slug: "utilities", parent: "bills", label: "Utilities (other)", keywords: ["gas", "lpg gas", "utility"] },
  { slug: "bills", parent: "bills", label: "Bill (other)", keywords: [] },

  // --- Eating out ---
  { slug: "eatingout_takeaway", parent: "eatingout", label: "Takeaway / delivery", keywords: ["uber eats", "ubereats", "mr d", "mr delivery", "mrd", "takeaway", "take-away", "take away", "delivery", "kfc", "nandos", "nando's", "steers", "debonairs", "roman's", "romans pizza", "chicken licken", "mcdonald", "mcdonalds", "burger king", "wimpy", "fishaways", "king pie", "food delivery"] },
  { slug: "eatingout_coffee", parent: "eatingout", label: "Coffee & café", keywords: ["cafe", "café", "coffee shop", "vida", "vida e caffe", "seattle coffee", "starbucks", "bootlegger", "mugg and bean", "coffee"] },
  { slug: "eatingout_drinks", parent: "eatingout", label: "Bars & drinks", keywords: ["bar", "drinks", "pub", "cocktail", "cocktails", "brewery", "tab", "round of drinks", "nightclub", "club"] },
  { slug: "eatingout_restaurant", parent: "eatingout", label: "Restaurant", keywords: ["restaurant", "dinner", "dinner out", "lunch out", "breakfast out", "sushi", "pizza", "burger", "marble", "date night", "spur", "ocean basket", "mugg", "col'cacchio", "panarottis", "the hussar", "rocomamas", "tashas", "kauai", "sit down meal"] },
  { slug: "eatingout", parent: "eatingout", label: "Eating out (other)", keywords: [] },

  // --- Transport ---
  { slug: "transport_rideshare", parent: "transport", label: "Uber / Bolt / taxi", keywords: ["uber", "bolt", "taxi", "indriver", "e-hailing", "ehailing", "cab", "lift club"] },
  { slug: "transport_fuel", parent: "transport", label: "Fuel / petrol", keywords: ["petrol", "fuel", "diesel", "fill up", "engen", "shell", "bp", "sasol", "total", "totalenergies", "caltex", "astron", "puma energy", "fuel up", "garage petrol"] },
  { slug: "transport_parking", parent: "transport", label: "Parking & tolls", keywords: ["parking", "parkade", "e-toll", "etoll", "toll", "toll gate", "toll fee", "sanral", "boom gate"] },
  { slug: "transport_public", parent: "transport", label: "Gautrain / public", keywords: ["gautrain", "bus", "myciti", "rea vaya", "train", "metrorail", "bus fare", "shuttle"] },
  { slug: "transport_car", parent: "transport", label: "Car service & upkeep", keywords: ["car service", "car wash", "tyre", "tyres", "tire", "licence disc", "license disc", "car licence", "mechanic", "panelbeat", "panel beater", "car battery", "engine oil", "wheel alignment", "roadworthy"] },
  { slug: "transport", parent: "transport", label: "Transport (other)", keywords: ["car"] },

  // --- Groceries (the big vocabulary lives on the general supermarket bucket) ---
  { slug: "groceries_liquor", parent: "groceries", label: "Liquor", keywords: ["liquor", "bottle store", "tops", "tops at spar", "makro liquor", "wine", "red wine", "white wine", "beer", "whisky", "whiskey", "vodka", "gin", "brandy", "cider", "savanna", "castle", "black label", "heineken", "hunters", "champagne", "sparkling wine", "six pack", "case of beer"] },
  { slug: "groceries_butcher", parent: "groceries", label: "Meat & butcher", keywords: ["butcher", "butchery", "deli", "braai pack", "braai meat", "meat market", "chops", "ribs", "wors roll ingredients"] },
  { slug: "groceries_consumables", parent: "groceries", label: "Household consumables", keywords: ["toilet paper", "cleaning supplies", "dishwash", "dishwashing liquid", "washing powder", "laundry detergent", "fabric softener", "sunlight liquid", "handy andy", "domestos", "cling wrap", "foil", "tin foil", "bin bags", "refuse bags", "black bags", "paper towel", "serviettes"] },
  { slug: "groceries", parent: "groceries", label: "Supermarket", keywords: GROCERY_WORDS },

  // --- Household ---
  { slug: "household_cleaning", parent: "household", label: "Cleaning & domestic help", keywords: ["domestic", "domestic worker", "helper", "char", "laundry service", "cleaner", "sweepsouth", "housekeeper", "gardener wages", "ironing"] },
  { slug: "household_security", parent: "household", label: "Security & armed response", keywords: ["security", "armed response", "adt", "fidelity adt", "fidelity", "chubb", "alarm", "beams", "cctv", "electric fence", "panic button", "guard"] },
  { slug: "household_maintenance", parent: "household", label: "Maintenance & hardware", keywords: ["hardware", "builders warehouse", "builders", "leroy merlin", "plumber", "plumbing", "electrician", "tools", "maintenance", "repair", "cashbuild", "handyman", "geyser", "paint", "brico"] },
  { slug: "household_furniture", parent: "household", label: "Furniture & décor", keywords: ["furniture", "decor", "linen", "towel", "coricraft", "mrp home", "mr price home", "@home", "at home", "sheet set", "duvet", "curtains", "rug", "wetherlys", "furniture city"] },
  { slug: "household_garden", parent: "household", label: "Garden", keywords: ["garden", "plant", "plants", "nursery", "lawn", "stodels", "lifestyle garden", "compost", "seedlings", "potting soil", "lawnmower"] },
  { slug: "household_pharmacy", parent: "household", label: "Pharmacy & toiletries", keywords: ["pharmacy", "clicks", "dis-chem", "dischem", "dis chem", "toiletr", "shampoo", "conditioner", "deodorant", "toothpaste", "nappies", "diapers", "cosmetics", "makeup", "skincare"] },
  { slug: "household", parent: "household", label: "Household (other)", keywords: ["supplies", "cleaning", "homeware"] },

  // --- Leisure (was Entertainment; travel/hobbies live here now) ---
  { slug: "entertainment_movies", parent: "leisure", label: "Movies & shows", keywords: ["movie", "movies", "cinema", "ster-kinekor", "ster kinekor", "sterkinekor", "nu metro", "numetro", "nu-metro", "show", "theatre", "theater", "imax", "popcorn cinema", "film"] },
  { slug: "entertainment_events", parent: "leisure", label: "Events & tickets", keywords: ["concert", "ticket", "tickets", "festival", "computicket", "quicket", "webtickets", "event", "gig", "expo", "comedy show"] },
  { slug: "entertainment_gaming", parent: "leisure", label: "Games", keywords: ["steam", "playstation", "ps5", "ps4", "psn", "xbox", "nintendo", "game pass", "gamepass", "epic games", "in-game", "loot", "battle pass"] },
  { slug: "entertainment_sport", parent: "leisure", label: "Sport & fitness", keywords: ["gym", "virgin active", "planet fitness", "parkrun", "sport", "sports", "padel", "golf", "squash", "cycling", "running shoes", "protein", "fitness"] },
  { slug: "other_travel", parent: "leisure", label: "Travel & accommodation", keywords: ["flight", "flights", "hotel", "booking.com", "bookingcom", "lodge", "travel", "getaway", "guesthouse", "car hire", "airbnb stay", "safari", "flysafair", "kulula", "backpackers"] },
  { slug: "leisure_hobbies", parent: "leisure", label: "Hobbies & outings", keywords: ["hobby", "outing", "activity", "crafts", "art supplies", "books", "bookstore", "exclusive books", "board game", "museum", "zoo", "aquarium", "picnic"] },
  { slug: "entertainment", parent: "leisure", label: "Leisure (other)", keywords: [] },

  // --- Other ---
  { slug: "other_medical", parent: "other", label: "Doctor & medical", keywords: ["doctor", "dentist", "hospital", "gp", "optometr", "physio", "physiotherap", "medical", "clinic", "consultation", "specialist", "radiology", "pathology", "blood test"] },
  { slug: "other_fees", parent: "other", label: "Bank & fees", keywords: ["bank fee", "bank charges", "service fee", "admin fee", "monthly account fee", "eft fee", "atm fee", "card fee", "interest charge"] },
  { slug: "other_gifts", parent: "other", label: "Gifts & donations", keywords: ["gift", "gifts", "donation", "present", "charity", "birthday present", "wedding gift", "tithe", "offering"] },
  { slug: "other_kids", parent: "other", label: "Kids & school", keywords: ["school", "school fees", "creche", "crèche", "daycare", "kids", "aftercare", "stationery", "textbooks", "uniform", "extra lessons", "tutor"] },
  { slug: "other_pets", parent: "other", label: "Pets", keywords: ["pet", "vet", "dog food", "cat food", "petshop", "pet shop", "petworld", "grooming pet", "kennel", "cattery", "deworm"] },
  { slug: "other_insurance", parent: "bills", label: "Insurance", keywords: [] }, // legacy slug → Bills
  { slug: "other", parent: "other", label: "Other", keywords: [] },
];

const SUB_BY_SLUG = new Map(SUBCATEGORIES.map((s) => [s.slug, s]));

/** Parent → its subcategories, in registry order (for the picker + reports). */
export const CATEGORY_TREE: Record<ParentCategory, SubcategoryDef[]> = PARENT_CATEGORIES.reduce(
  (acc, p) => {
    acc[p] = SUBCATEGORIES.filter((s) => s.parent === p);
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

/**
 * Generic, multi-category RETAILERS. These say WHERE money was spent, not WHAT
 * on, so they only get a small nudge (weight 0.5): enough to categorise a bare
 * "checkers" as Groceries, but not enough to override a specific item or brand
 * that appears alongside ("wine at checkers" → Liquor, "woolworths sushi" →
 * Restaurant). Stored in squashed form (separators removed) for lookup.
 */
const RETAILER_BRANDS = new Set<string>([
  "grocer", "groceries", "supermarket", "woolworth", "woolworths", "woolies",
  "checkers", "picknpay", "pnp", "spar", "shoprite", "usave", "boxer",
  "foodlover", "foodlovers", "fruitveg", "okfoods", "okgrocer", "makro",
  "cambridge", "presidenthyper", "gamefood", "foodstore", "game", "clicks",
]);

/**
 * Distinctive single-token BRANDS worth a strength boost (+1) and eligible for
 * fuzzy (typo) matching. Multi-word brands ("virgin active", "ocean basket")
 * already score high via the phrase bonus, so they don't need listing here.
 * Squashed form.
 */
const STRONG_BRANDS = new Set<string>([
  // bills / subs
  "netflix", "spotify", "showmax", "disney", "audible", "vodacom", "telkom",
  "multichoice", "dstv", "eskom", "afrihost", "webafrica", "vumatel", "openserve",
  "mweb", "outsurance", "santam", "miway", "hollard", "discovery", "momentum",
  "bonitas", "medshield", "fedhealth",
  // eating out
  "nandos", "steers", "debonairs", "wimpy", "mcdonalds", "kfc", "fishaways",
  "spur", "starbucks", "bootlegger", "rocomamas", "panarottis", "kauai", "tashas",
  // transport
  "engen", "sasol", "caltex", "astron", "gautrain", "myciti", "sanral", "uber",
  "bolt", "indriver",
  // groceries / liquor
  "savanna", "heineken", "castle", "hunters",
  // household
  "dischem", "sweepsouth", "coricraft", "cashbuild", "stodels", "wetherlys",
  // leisure
  "sterkinekor", "numetro", "computicket", "quicket", "webtickets", "steam",
  "playstation", "xbox", "nintendo", "flysafair", "kulula",
]);

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

interface MatchCtx {
  /** lower-cased, accent-stripped, punctuation preserved. */
  lower: string;
  /** alphanumeric tokens. */
  tokens: string[];
  /** tokens joined by single spaces (for clean phrase substring). */
  spaced: string;
  /** all separators removed (for separator-insensitive phrase matching). */
  squash: string;
}

function buildCtx(desc: string | null | undefined): MatchCtx {
  const lower = stripAccents((desc ?? "").toLowerCase());
  const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
  return {
    lower,
    tokens,
    spaced: tokens.join(" "),
    squash: lower.replace(/[^a-z0-9]+/g, ""),
  };
}

/** Bounded Levenshtein: true iff edit distance between a and b is ≤ 1. */
function editWithin1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la > lb) return editWithin1(b, a); // ensure a is the shorter/equal one
  // la <= lb
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      if (++edits > 1) return false;
      if (la === lb) {
        i++;
        j++;
      } else {
        j++; // skip the extra char in the longer string
      }
    }
  }
  edits += lb - j; // trailing chars in the longer string
  return edits <= 1;
}

interface KwMatch {
  fuzzy: boolean;
  /** token indices this keyword covered (single-word matches). */
  tokenIdx: number[];
  /** dedup key for phrase matches (squashed phrase); undefined for word matches. */
  phraseKey?: string;
}

/**
 * Keyword match with separator-insensitivity, word awareness and bounded fuzz.
 *
 *  - Phrases / punctuated keywords ("uber eats", "e-toll", "ster-kinekor"):
 *    matched by squashed substring (≥5 chars) so hyphen/space/apostrophe
 *    variants unify, with a clean single-spaced substring fallback.
 *  - Plain single words: must hit a whole token, a simple plural of it
 *    (apple→apples), or a prefix when the keyword is ≥6 chars (grocer→
 *    groceries) — never a spurious substring (car ✗ cardigan, tea ✗ steam).
 *  - Distinctive words ≥5 chars additionally match within Levenshtein-1 to
 *    absorb typos (netflx→netflix); such hits are flagged `fuzzy` and scored
 *    at a discount.
 */
function matchKeyword(ctx: MatchCtx, kwRaw: string): KwMatch | null {
  const kw = stripAccents(kwRaw.toLowerCase()).trim();
  if (!kw) return null;
  const kwTokens = kw.split(/[^a-z0-9]+/).filter(Boolean);
  const isPhrase = kwTokens.length > 1 || /[^a-z0-9]/.test(kw);

  if (isPhrase) {
    const ksq = kw.replace(/[^a-z0-9]+/g, "");
    if (ksq.length >= 5 && ctx.squash.includes(ksq)) return { fuzzy: false, tokenIdx: [], phraseKey: ksq };
    const kwSpaced = kwTokens.join(" ");
    if (kwSpaced && ctx.spaced.includes(kwSpaced)) return { fuzzy: false, tokenIdx: [], phraseKey: ksq };
    // short punctuated tokens (e.g. "@home") — literal substring on lower text
    if (ksq.length < 5 && /[^a-z0-9]/.test(kw) && ctx.lower.includes(kw))
      return { fuzzy: false, tokenIdx: [], phraseKey: kw };
    return null;
  }

  // single word — collect every token it hits, so duplicate/near-duplicate
  // keywords (ticket/tickets) can be credited once per token by the scorer.
  const exactIdx: number[] = [];
  ctx.tokens.forEach((t, i) => {
    if (t === kw || t === kw + "s" || t === kw + "es" || (kw.length >= 6 && t.startsWith(kw))) {
      exactIdx.push(i);
    }
  });
  if (exactIdx.length) return { fuzzy: false, tokenIdx: exactIdx };

  if (kw.length >= 5) {
    const fuzzyIdx: number[] = [];
    ctx.tokens.forEach((t, i) => {
      if (Math.abs(t.length - kw.length) <= 1 && editWithin1(t, kw)) fuzzyIdx.push(i);
    });
    if (fuzzyIdx.length) return { fuzzy: true, tokenIdx: fuzzyIdx };
  }
  return null;
}

/**
 * Evidence weight of a matched keyword:
 *  - RETAILER brands: 0.5 (weak "where", overridable by any specific signal).
 *  - Otherwise: phrase length (1 per word), +1 for a distinctive brand or any
 *    multi-word phrase.
 *  - Fuzzy (typo) hits discounted ×0.75 so they never beat a clean match.
 */
function keywordWeight(kwRaw: string, fuzzy: boolean): number {
  const kw = stripAccents(kwRaw.toLowerCase()).trim();
  const sq = kw.replace(/[^a-z0-9]+/g, "");
  const tokenCount = kw.split(/[^a-z0-9]+/).filter(Boolean).length;
  let w: number;
  if (RETAILER_BRANDS.has(sq)) {
    w = 0.5;
  } else {
    w = tokenCount;
    if (STRONG_BRANDS.has(sq) || tokenCount >= 2) w += 1;
  }
  return fuzzy ? w * 0.75 : w;
}

/**
 * Internal scorer — used by `autoCategory`. Returns the winning slug plus the
 * numeric score and runner-up, so tests (and any future "needs review" gate)
 * can reason about confidence without changing the public API.
 */
function scoreCategory(description: string | null | undefined): {
  slug: Category;
  score: number;
  runnerUp: number;
} {
  const ctx = buildCtx(description);
  if (ctx.tokens.length === 0) return { slug: "other", score: 0, runnerUp: 0 };

  let best: string | null = null;
  let bestScore = 0;
  let runnerUp = 0;

  SUBCATEGORIES.forEach((sub) => {
    if (sub.keywords.length === 0) return;
    // Credit each covered token (and each distinct phrase) at most once, keeping
    // the strongest weight — so listing both "ticket" and "tickets", or a word
    // that both exact- and prefix-matches the same token, never double-counts.
    const tokenCredit = new Map<number, number>();
    const phraseCredit = new Map<string, number>();
    for (const kw of sub.keywords) {
      const m = matchKeyword(ctx, kw);
      if (!m) continue;
      const w = keywordWeight(kw, m.fuzzy);
      if (m.phraseKey !== undefined) {
        phraseCredit.set(m.phraseKey, Math.max(phraseCredit.get(m.phraseKey) ?? 0, w));
      } else {
        for (const idx of m.tokenIdx) tokenCredit.set(idx, Math.max(tokenCredit.get(idx) ?? 0, w));
      }
    }
    let score = 0;
    for (const v of tokenCredit.values()) score += v;
    for (const v of phraseCredit.values()) score += v;
    if (score > bestScore) {
      runnerUp = bestScore;
      bestScore = score;
      best = sub.slug;
    } else if (score > runnerUp) {
      runnerUp = score;
    }
    // ties keep the earlier (higher-priority) sub, since we only replace on
    // strictly greater score.
  });

  return { slug: best ?? "other", score: bestScore, runnerUp };
}

/**
 * Auto-detect a subcategory slug from a free-text description.
 *
 * Scoring-based (not order-based): every subcategory is scored by the strength
 * of its matched keywords, and the strongest wins; registry order only breaks
 * exact ties. Always overridable by the user. Returns "other" when nothing
 * matches.
 */
export function autoCategory(description: string | null | undefined): Category {
  return scoreCategory(description).slug;
}
