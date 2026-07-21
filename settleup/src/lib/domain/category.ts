/**
 * Two-level expense categorisation (Phase 6, ADR-0011).
 *
 * Eight PARENT categories (unchanged slugs/colours/icons — legacy expense rows
 * that stored a bare parent slug still resolve) each hold several SUBCATEGORIES,
 * curated for a South African household (prepaid electricity, DSTV, e-tolls,
 * domestic help, armed response, medical aid, airtime…).
 *
 * `autoCategory(desc)` picks a subcategory slug from description keywords
 * (order-sensitive — earlier entries win, so "uber eats" → takeaway before
 * "uber" → rideshare). The result is always overridable in the UI.
 *
 * Storage: expense.category is free text; slugs are stored as-is. No migration.
 */

/** The eight parent categories (stable slugs, from the original design). */
export type ParentCategory =
  | "groceries"
  | "rent"
  | "utilities"
  | "eatingout"
  | "transport"
  | "household"
  | "entertainment"
  | "other";

/** A stored category slug — a subcategory, or a bare parent slug (legacy/general). */
export type Category = string;

/** Parent display metadata: labels + accent colours + emoji glyphs (design tokens). */
export const CATEGORY_META: Record<ParentCategory, { label: string; color: string; icon: string }> = {
  groceries: { label: "Groceries", color: "#7FB6F5", icon: "🛒" },
  rent: { label: "Rent", color: "#A9ABF8", icon: "🏠" },
  utilities: { label: "Utilities", color: "#E9BF73", icon: "💡" },
  eatingout: { label: "Eating out", color: "#6FD7AC", icon: "🍽️" },
  transport: { label: "Transport", color: "#74D2E0", icon: "🚗" },
  household: { label: "Household", color: "#C9A6F4", icon: "🧺" },
  entertainment: { label: "Entertainment", color: "#F39DC0", icon: "🎬" },
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

/**
 * Ordered subcategory registry. Array order IS auto-detection priority.
 * Each parent's "general" bucket (slug === parent) carries no keywords and is
 * the manual/fallback choice for that parent; legacy rows land here too.
 */
export const SUBCATEGORIES: SubcategoryDef[] = [
  // --- Rent ---
  { slug: "rent", parent: "rent", label: "Rent / bond", keywords: ["rent", "bond", "lease", "accommodation", "airbnb"] },
  { slug: "rent_levies", parent: "rent", label: "Levies & rates", keywords: ["levy", "levies", "rates", "body corporate", "hoa"] },
  { slug: "rent_deposit", parent: "rent", label: "Deposit", keywords: ["deposit"] },

  // --- Utilities ---
  { slug: "utilities_electricity", parent: "utilities", label: "Electricity / prepaid", keywords: ["electric", "prepaid", "eskom", "load"] },
  { slug: "utilities_water", parent: "utilities", label: "Water & municipal", keywords: ["water", "municipal", "rates and taxes", "refuse", "sewer"] },
  { slug: "utilities_internet", parent: "utilities", label: "Internet / fibre", keywords: ["fibre", "fiber", "internet", "wifi", "wi-fi", "adsl", "vumatel", "webafrica"] },
  { slug: "utilities_mobile", parent: "utilities", label: "Mobile / airtime", keywords: ["airtime", "data bundle", "vodacom", "mtn", "telkom mobile", "cell c", "rain"] },
  { slug: "utilities_tv", parent: "utilities", label: "TV licence / DSTV", keywords: ["dstv", "tv licence", "tv license", "multichoice"] },
  { slug: "utilities", parent: "utilities", label: "Utilities (other)", keywords: ["gas", "utility"] },

  // --- Eating out (before transport so "uber eats" wins) ---
  { slug: "eatingout_takeaway", parent: "eatingout", label: "Takeaway / delivery", keywords: ["uber eats", "mr d", "mrd", "takeaway", "take-away", "delivery", "kfc", "nandos", "nando's", "steers", "debonairs"] },
  { slug: "eatingout_coffee", parent: "eatingout", label: "Coffee & café", keywords: ["coffee", "cafe", "café", "vida", "seattle", "bootlegger"] },
  { slug: "eatingout_drinks", parent: "eatingout", label: "Bars & drinks", keywords: ["bar ", "drinks", "pub", "cocktail"] },
  { slug: "eatingout_restaurant", parent: "eatingout", label: "Restaurant", keywords: ["restaurant", "dinner", "lunch", "breakfast", "sushi", "pizza", "burger", "marble", "date night"] },
  { slug: "eatingout", parent: "eatingout", label: "Eating out (other)", keywords: [] },

  // --- Transport ---
  { slug: "transport_rideshare", parent: "transport", label: "Uber / Bolt / taxi", keywords: ["uber", "bolt", "taxi"] },
  { slug: "transport_fuel", parent: "transport", label: "Fuel / petrol", keywords: ["petrol", "fuel", "diesel", "engen", "shell", "bp ", "sasol", "total"] },
  { slug: "transport_parking", parent: "transport", label: "Parking & tolls", keywords: ["parking", "e-toll", "etoll", "toll", "sanral"] },
  { slug: "transport_public", parent: "transport", label: "Gautrain / public", keywords: ["gautrain", "bus", "myciti", "train"] },
  { slug: "transport_car", parent: "transport", label: "Car service & upkeep", keywords: ["car service", "tyre", "tire", "licen", "mechanic", "panelbeat", "battery"] },
  { slug: "transport", parent: "transport", label: "Transport (other)", keywords: ["car "] },

  // --- Groceries ---
  { slug: "groceries_liquor", parent: "groceries", label: "Liquor", keywords: ["liquor", "bottle store", "tops", "makro liquor", "wine", "beer"] },
  { slug: "groceries_butcher", parent: "groceries", label: "Butcher & deli", keywords: ["butcher", "deli", "meat", "braai pack"] },
  { slug: "groceries_consumables", parent: "groceries", label: "Household consumables", keywords: ["toilet paper", "cleaning supplies", "dishwash", "washing powder"] },
  { slug: "groceries", parent: "groceries", label: "Supermarket", keywords: ["grocer", "woolworth", "woolies", "checkers", "pick n pay", "pnp", "spar", "food ", "milk", "bread", "beans", "snacks", "shop", "makro", "game "] },

  // --- Household ---
  { slug: "household_cleaning", parent: "household", label: "Cleaning & domestic help", keywords: ["cleaning", "domestic", "helper", "char", "laundry"] },
  { slug: "household_security", parent: "household", label: "Security & armed response", keywords: ["security", "armed response", "adt", "fidelity", "alarm", "beams"] },
  { slug: "household_maintenance", parent: "household", label: "Maintenance & hardware", keywords: ["hardware", "builders", "leroy merlin", "plumber", "electrician", "tools", "maintenance", "repair"] },
  { slug: "household_furniture", parent: "household", label: "Furniture & décor", keywords: ["furniture", "decor", "linen", "towel", "coricraft", "mrp home"] },
  { slug: "household_garden", parent: "household", label: "Garden", keywords: ["garden", "plant", "nursery", "lawn", "stodels"] },
  { slug: "household_pharmacy", parent: "household", label: "Pharmacy & toiletries", keywords: ["pharmacy", "clicks", "dis-chem", "dischem", "toiletr"] },
  { slug: "household", parent: "household", label: "Household (other)", keywords: ["supplies"] },

  // --- Entertainment ---
  { slug: "entertainment_streaming", parent: "entertainment", label: "Streaming & music", keywords: ["netflix", "spotify", "showmax", "disney", "apple music", "youtube premium", "amazon prime"] },
  { slug: "entertainment_movies", parent: "entertainment", label: "Movies & shows", keywords: ["movie", "cinema", "ster-kinekor", "nu metro", "show", "theatre"] },
  { slug: "entertainment_events", parent: "entertainment", label: "Events & tickets", keywords: ["concert", "ticket", "festival", "computicket", "quicket", "event"] },
  { slug: "entertainment_gaming", parent: "entertainment", label: "Games", keywords: ["steam", "playstation", "xbox", "nintendo", "game pass"] },
  { slug: "entertainment_sport", parent: "entertainment", label: "Sport & fitness", keywords: ["gym", "virgin active", "planet fitness", "parkrun", "sport"] },
  { slug: "entertainment", parent: "entertainment", label: "Entertainment (other)", keywords: [] },

  // --- Other ---
  { slug: "other_medical", parent: "other", label: "Medical & medical aid", keywords: ["medical aid", "discovery health", "momentum health", "doctor", "dentist", "hospital", "medical"] },
  { slug: "other_insurance", parent: "other", label: "Insurance", keywords: ["insurance", "outsurance", "santam", "miway", "premium"] },
  { slug: "other_fees", parent: "other", label: "Bank & fees", keywords: ["bank fee", "bank charges", "service fee", "admin fee"] },
  { slug: "other_gifts", parent: "other", label: "Gifts & donations", keywords: ["gift", "donation", "present", "charity"] },
  { slug: "other_kids", parent: "other", label: "Kids & school", keywords: ["school", "creche", "crèche", "daycare", "kids"] },
  { slug: "other_pets", parent: "other", label: "Pets", keywords: ["pet", "vet", "dog food", "cat food"] },
  { slug: "other_travel", parent: "other", label: "Travel & accommodation", keywords: ["flight", "hotel", "booking.com", "lodge", "travel"] },
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

/** Auto-detect a subcategory slug from a free-text description (order-sensitive). */
export function autoCategory(description: string | null | undefined): Category {
  const s = (description ?? "").toLowerCase();
  for (const sub of SUBCATEGORIES) {
    if (sub.keywords.some((w) => s.includes(w))) return sub.slug;
  }
  return "other";
}
