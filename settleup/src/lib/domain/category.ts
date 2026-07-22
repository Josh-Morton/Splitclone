/**
 * Two-level expense categorisation (Phase 6, ADR-0011; parents reworked
 * 2026-07-19 per Josh — fewer, more intuitive top-level buckets + a much
 * larger keyword database).
 *
 * SEVEN parent categories, modelled on what mainstream money apps use
 * (Splitwise: Food/Home/Transport/…; Monarch/Mint: Groceries, Bills &
 * Utilities, Food & Dining, …). The old 8 collapsed rent+utilities+
 * subscriptions into one intuitive "Bills & rent" (the monthly-expenses
 * bucket) and renamed Entertainment → Leisure:
 *
 *   Groceries · Eating out · Bills & rent · Transport · Household ·
 *   Leisure · Other
 *
 * Each parent holds SUBCATEGORIES, curated for a South African household
 * (prepaid electricity, DSTV, airtime, e-tolls, domestic help, armed response,
 * medical aid, municipal rates…). `autoCategory(desc)` picks a subcategory slug
 * from description keywords — order-sensitive (earlier entries win, so "uber
 * eats" → takeaway before "uber" → rideshare). The result is always overridable.
 *
 * Storage: expense.category is free text; slugs stored as-is. Legacy slugs
 * (incl. the retired "rent"/"utilities"/"entertainment" parents) still resolve
 * because they remain in the registry, re-parented to their new home. No
 * migration.
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

/** Parent display metadata: labels + accent colours + emoji glyphs (design tokens). */
export const CATEGORY_META: Record<ParentCategory, { label: string; color: string; icon: string }> = {
  groceries: { label: "Groceries", color: "#7FB6F5", icon: "🛒" },
  eatingout: { label: "Eating out", color: "#6FD7AC", icon: "🍽️" },
  bills: { label: "Bills & rent", color: "#A9ABF8", icon: "🏠" },
  transport: { label: "Transport", color: "#74D2E0", icon: "🚗" },
  household: { label: "Household", color: "#C9A6F4", icon: "🧺" },
  leisure: { label: "Leisure", color: "#F39DC0", icon: "🎬" },
  other: { label: "Other", color: "#AEB9CC", icon: "🧾" },
};

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
// land on Groceries automatically.
const GROCERY_WORDS = [
  // retailers
  "grocer", "groceries", "supermarket", "woolworth", "woolies", "checkers", "pick n pay",
  "pick 'n pay", "pnp", "spar", "shoprite", "usave", "boxer", "food lover", "fruit & veg",
  "fruit and veg", "ok foods", "makro", "cambridge", "president hyper",
  // staples & pantry
  "food ", "milk", "bread", "eggs", "egg ", "butter", "margarine", "cheese", "cheddar",
  "gouda", "feta", "mozzarella", "cream cheese", "yoghurt", "yogurt", "cream", "amasi", "maas",
  "rice", "pasta", "spaghetti", "macaroni", "noodles", "flour", "cake flour", "maize",
  "mielie meal", "maize meal", "pap", "samp", "oats", "cereal", "weetbix", "cornflakes",
  "muesli", "sugar", "salt", "spice", "spices", "cooking oil", "olive oil", "sunflower oil",
  "vinegar", "tomato sauce", "ketchup", "mayo", "mayonnaise", "mustard", "chutney", "jam",
  "honey", "peanut butter", "marmite", "bovril", "stock cube", "gravy", "soup",
  // meat & protein
  "chicken", "beef", "mince", "steak", "pork", "lamb", "sausage", "boerewors", "wors",
  "bacon", "ham", "polony", "viennas", "russians", "fish", "hake", "tuna", "salmon",
  // produce
  "vegetables", "veggies", " veg", "fruit", "apple", "banana", "orange", "grapes",
  "berries", "strawberr", "tomato", "potato", "onion", "carrot", "lettuce", "spinach",
  "cabbage", "broccoli", "cauliflower", "cucumber", "avocado", " avo", "garlic", "ginger",
  "lemon", "lime", "mushroom", "corn", "mielies", "beans", "lentils", "chickpeas",
  // bakery / snacks / drinks
  "bakery", "roll ", "bun ", "cake", "muffin", "biscuit", "cookies", "rusks", "chocolate",
  "sweets", "candy", "snacks", "nuts", "biltong", "droëwors", "drywors", "popcorn", "chips",
  "crisps", "ice cream", "juice", "cooldrink", "cold drink", "cooldrinks", "soda", "fizzy",
  "coke", "coffee", "tea", "rooibos", "sparkling water", "bottled water", "still water",
  // baking / misc
  "baking powder", "yeast", "vanilla", "cocoa", "icing sugar", "custard", "canned", "tinned",
  "baby food", "formula",
];

/**
 * Ordered subcategory registry. Array order IS auto-detection priority.
 * Each parent's "general" bucket (slug === parent) carries no keywords and is
 * the manual/fallback choice; legacy rows land here too.
 */
export const SUBCATEGORIES: SubcategoryDef[] = [
  // --- Bills & rent (the "monthly expenses" bucket) — checked first as its
  //     keywords are the most distinctive. Legacy rent_/utilities_ slugs live
  //     here now. ---
  { slug: "rent", parent: "bills", label: "Rent / bond", keywords: ["rent", "bond", "lease", "accommodation", "airbnb"] },
  { slug: "rent_levies", parent: "bills", label: "Levies & rates", keywords: ["levy", "levies", "rates", "body corporate", "hoa"] },
  { slug: "rent_deposit", parent: "bills", label: "Deposit", keywords: ["deposit"] },
  { slug: "utilities_electricity", parent: "bills", label: "Electricity / prepaid", keywords: ["electric", "prepaid electric", "prepaid", "eskom", "load shedding", "loadshedding"] },
  { slug: "utilities_water", parent: "bills", label: "Water & municipal", keywords: ["water bill", "municipal", "rand water", "sanitation", "refuse", "sewer"] },
  { slug: "utilities_internet", parent: "bills", label: "Internet / fibre", keywords: ["fibre", "fiber", "internet", "wifi", "wi-fi", "adsl", "vumatel", "webafrica", "afrihost", "cool ideas"] },
  { slug: "utilities_mobile", parent: "bills", label: "Mobile / airtime", keywords: ["airtime", "data bundle", "vodacom", "mtn", "telkom", "cell c", "rain "] },
  { slug: "utilities_tv", parent: "bills", label: "DSTV / TV licence", keywords: ["dstv", "tv licence", "tv license", "multichoice"] },
  { slug: "bills_insurance", parent: "bills", label: "Insurance", keywords: ["insurance", "outsurance", "santam", "miway", "king price", "premium"] },
  { slug: "bills_medical", parent: "bills", label: "Medical aid", keywords: ["medical aid", "discovery health", "momentum health", "bonitas", "medshield"] },
  { slug: "entertainment_streaming", parent: "bills", label: "Streaming & subscriptions", keywords: ["netflix", "spotify", "showmax", "disney", "apple music", "youtube premium", "amazon prime", "subscription"] },
  { slug: "utilities", parent: "bills", label: "Utilities (other)", keywords: ["gas", "utility"] },
  { slug: "bills", parent: "bills", label: "Bill (other)", keywords: [] },

  // --- Eating out (before transport so "uber eats" wins) ---
  { slug: "eatingout_takeaway", parent: "eatingout", label: "Takeaway / delivery", keywords: ["uber eats", "mr d", "mrd", "takeaway", "take-away", "delivery", "kfc", "nandos", "nando's", "steers", "debonairs", "roman's", "romans pizza", "mcdonald", "burger king"] },
  { slug: "eatingout_coffee", parent: "eatingout", label: "Coffee & café", keywords: ["cafe", "café", "coffee shop", "vida", "seattle coffee", "starbucks", "bootlegger"] },
  { slug: "eatingout_drinks", parent: "eatingout", label: "Bars & drinks", keywords: ["bar ", " drinks", "pub", "cocktail", "brewery"] },
  { slug: "eatingout_restaurant", parent: "eatingout", label: "Restaurant", keywords: ["restaurant", "dinner", "lunch out", "breakfast out", "sushi", "pizza", "burger", "marble", "date night", "spur", "ocean basket", "mugg"] },
  { slug: "eatingout", parent: "eatingout", label: "Eating out (other)", keywords: [] },

  // --- Transport ---
  { slug: "transport_rideshare", parent: "transport", label: "Uber / Bolt / taxi", keywords: ["uber", "bolt", "taxi", "indriver"] },
  { slug: "transport_fuel", parent: "transport", label: "Fuel / petrol", keywords: ["petrol", "fuel", "diesel", "engen", "shell", "bp ", "sasol", "total ", "caltex", "astron"] },
  { slug: "transport_parking", parent: "transport", label: "Parking & tolls", keywords: ["parking", "e-toll", "etoll", "toll", "sanral"] },
  { slug: "transport_public", parent: "transport", label: "Gautrain / public", keywords: ["gautrain", " bus", "myciti", "train", "metrorail"] },
  { slug: "transport_car", parent: "transport", label: "Car service & upkeep", keywords: ["car service", "tyre", "tire", "licence disc", "license disc", "mechanic", "panelbeat", "car battery", "engine oil"] },
  { slug: "transport", parent: "transport", label: "Transport (other)", keywords: ["car "] },

  // --- Groceries (the big vocabulary lives on the general supermarket bucket) ---
  { slug: "groceries_liquor", parent: "groceries", label: "Liquor", keywords: ["liquor", "bottle store", "tops ", "makro liquor", "wine", "beer", "whisky", "vodka", "gin", "cider", "savanna", "castle "] },
  { slug: "groceries_butcher", parent: "groceries", label: "Meat & butcher", keywords: ["butcher", "deli", "braai pack", "meat market"] },
  { slug: "groceries_consumables", parent: "groceries", label: "Household consumables", keywords: ["toilet paper", "cleaning supplies", "dishwash", "washing powder", "sunlight liquid", "handy andy", "cling wrap", "foil", "bin bags", "refuse bags"] },
  { slug: "groceries", parent: "groceries", label: "Supermarket", keywords: GROCERY_WORDS },

  // --- Household ---
  { slug: "household_cleaning", parent: "household", label: "Cleaning & domestic help", keywords: ["domestic", "helper", "char", "laundry", "cleaner", "sweepsouth"] },
  { slug: "household_security", parent: "household", label: "Security & armed response", keywords: ["security", "armed response", "adt", "fidelity adt", "alarm", "beams", "cctv"] },
  { slug: "household_maintenance", parent: "household", label: "Maintenance & hardware", keywords: ["hardware", "builders warehouse", "leroy merlin", "plumber", "electrician", "tools", "maintenance", "repair", "cashbuild"] },
  { slug: "household_furniture", parent: "household", label: "Furniture & décor", keywords: ["furniture", "decor", "linen", "towel", "coricraft", "mrp home", "@home", "sheet set"] },
  { slug: "household_garden", parent: "household", label: "Garden", keywords: ["garden", "plant", "nursery", "lawn", "stodels", "compost"] },
  { slug: "household_pharmacy", parent: "household", label: "Pharmacy & toiletries", keywords: ["pharmacy", "clicks", "dis-chem", "dischem", "toiletr", "shampoo", "nappies", "diapers"] },
  { slug: "household", parent: "household", label: "Household (other)", keywords: ["supplies", "cleaning"] },

  // --- Leisure (was Entertainment; travel/hobbies live here now) ---
  { slug: "entertainment_movies", parent: "leisure", label: "Movies & shows", keywords: ["movie", "cinema", "ster-kinekor", "nu metro", " show", "theatre"] },
  { slug: "entertainment_events", parent: "leisure", label: "Events & tickets", keywords: ["concert", "ticket", "festival", "computicket", "quicket", " event"] },
  { slug: "entertainment_gaming", parent: "leisure", label: "Games", keywords: ["steam", "playstation", "xbox", "nintendo", "game pass"] },
  { slug: "entertainment_sport", parent: "leisure", label: "Sport & fitness", keywords: ["gym", "virgin active", "planet fitness", "parkrun", "sport", "padel"] },
  { slug: "other_travel", parent: "leisure", label: "Travel & accommodation", keywords: ["flight", "hotel", "booking.com", "lodge", "travel", "getaway"] },
  { slug: "leisure_hobbies", parent: "leisure", label: "Hobbies & outings", keywords: ["hobby", "outing", "activity", "crafts"] },
  { slug: "entertainment", parent: "leisure", label: "Leisure (other)", keywords: [] },

  // --- Other ---
  { slug: "other_medical", parent: "other", label: "Doctor & medical", keywords: ["doctor", "dentist", "hospital", "gp ", "optometr", "physio", "medical"] },
  { slug: "other_fees", parent: "other", label: "Bank & fees", keywords: ["bank fee", "bank charges", "service fee", "admin fee"] },
  { slug: "other_gifts", parent: "other", label: "Gifts & donations", keywords: ["gift", "donation", "present", "charity"] },
  { slug: "other_kids", parent: "other", label: "Kids & school", keywords: ["school", "creche", "crèche", "daycare", "kids", "stationery"] },
  { slug: "other_pets", parent: "other", label: "Pets", keywords: ["pet ", "vet ", "dog food", "cat food", "petshop"] },
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
  };
}

/**
 * Keyword match with word awareness (avoids "tea"→"steam", "gin"→"virgin"):
 *  - phrases / punctuated keywords ("uber eats", "e-toll", "café") → substring
 *  - plain single words → must match a whole token, or a token that starts
 *    with it when the keyword is ≥4 chars (so "apple"→"apples", "grocer"→
 *    "groceries", but "car" won't grab "cardigan").
 */
function keywordMatches(descLower: string, tokens: string[], kwRaw: string): boolean {
  const k = kwRaw.trim().toLowerCase();
  if (!k) return false;
  if (/[^a-z0-9]/.test(k)) return descLower.includes(k);
  return tokens.some((t) => t === k || (k.length >= 4 && t.startsWith(k)));
}

/** Auto-detect a subcategory slug from a free-text description (order-sensitive). */
export function autoCategory(description: string | null | undefined): Category {
  const s = (description ?? "").toLowerCase();
  const tokens = s.split(/[^a-z0-9]+/).filter(Boolean);
  for (const sub of SUBCATEGORIES) {
    if (sub.keywords.some((w) => keywordMatches(s, tokens, w))) return sub.slug;
  }
  return "other";
}
