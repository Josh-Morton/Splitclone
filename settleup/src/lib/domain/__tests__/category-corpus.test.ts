import { describe, it, expect } from "vitest";
import { autoCategory, scoreCategory, SUBCATEGORIES, CATEGORY_TREE, PARENT_CATEGORIES } from "../category";

/**
 * Golden corpus: how real people in a South African household actually write
 * an expense, and where a human would file it. Expectations were written
 * before tuning the library — when one fails, fix the library, not the row.
 */
const CORPUS: [string, string][] = [
  // --- Bills & rent ---
  ["October rent", "rent"],
  ["Rent", "rent"],
  ["Bond repayment", "rent"],
  ["Huur", "rent"],
  ["Body corporate levy", "rent_levies"],
  ["Rates and taxes", "rent_levies"],
  ["Damage deposit for the flat", "rent_deposit"],
  ["Eskom prepaid electricity", "utilities_electricity"],
  ["Prepaid", "utilities_electricity"],
  ["Electricity units", "utilities_electricity"],
  ["City Power", "utilities_electricity"],
  ["Water bill", "utilities_water"],
  ["City of Joburg municipal account", "utilities_water"],
  ["Vumatel fibre", "utilities_internet"],
  ["Afrihost uncapped", "utilities_internet"],
  ["Telkom fibre", "utilities_internet"],
  ["Starlink", "utilities_internet"],
  ["Vodacom airtime", "utilities_mobile"],
  ["MTN data bundle", "utilities_mobile"],
  ["Prepaid airtime", "utilities_mobile"],
  ["Phone contract", "utilities_mobile"],
  ["DSTV Premium", "utilities_tv"],
  ["TV licence", "utilities_tv"],
  ["Household contents insurance", "bills_insurance"],
  ["Car insurance", "bills_insurance"],
  ["OUTsurance", "bills_insurance"],
  ["Funeral policy", "bills_insurance"],
  ["Medical aid", "bills_medical"],
  ["Discovery Health", "bills_medical"],
  ["Discovery", "bills_medical"],
  ["Credit card payment", "bills_debt"],
  ["PayJustNow instalment", "bills_debt"],
  ["Netflix", "entertainment_streaming"],
  ["Netflix (on hold)", "entertainment_streaming"],
  ["netflx", "entertainment_streaming"],
  ["Spotify family", "entertainment_streaming"],
  ["Disney+", "entertainment_streaming"],
  ["YouTube Premium", "entertainment_streaming"],
  ["ChatGPT Plus", "entertainment_streaming"],
  ["Subscription", "entertainment_streaming"],
  ["Gas refill", "utilities"],
  ["Monthly bill", "bills"],

  // --- Eating out ---
  ["Uber Eats — rainy Sunday", "eatingout_takeaway"],
  ["uber eats", "eatingout_takeaway"],
  ["Mr D", "eatingout_takeaway"],
  ["Nando's", "eatingout_takeaway"],
  ["Nandos", "eatingout_takeaway"],
  ["nandoos", "eatingout_takeaway"],
  ["KFC bucket", "eatingout_takeaway"],
  ["McDonald's", "eatingout_takeaway"],
  ["Debonairs pizza", "eatingout_takeaway"],
  ["Takeaways", "eatingout_takeaway"],
  ["Bolt Food", "eatingout_takeaway"],
  ["Bunny chow", "eatingout_takeaway"],
  ["Flat white x2", "eatingout_coffee"],
  ["Vida e Caffè", "eatingout_coffee"],
  ["Mugg & Bean breakfast", "eatingout_coffee"],
  ["Cappuccino and muffin", "eatingout_coffee"],
  ["Coffee date", "eatingout_coffee"],
  ["Friday drinks at the local", "eatingout_drinks"],
  ["Bar tab", "eatingout_drinks"],
  ["Beers at the pub", "eatingout_drinks"],
  ["Cocktails", "eatingout_drinks"],
  ["Marble dinner (birthday)", "eatingout_restaurant"],
  ["Dinner", "eatingout_restaurant"],
  ["Lunch", "eatingout_restaurant"],
  ["Spur", "eatingout_restaurant"],
  ["Ocean Basket", "eatingout_restaurant"],
  ["Sushi", "eatingout_restaurant"],
  ["Sushi bar", "eatingout_restaurant"],
  ["Woolworths sushi", "eatingout_restaurant"],
  ["Date night", "eatingout_restaurant"],
  ["Col'Cacchio", "eatingout_restaurant"],
  ["Fine dining", "eatingout_restaurant"],

  // --- Transport ---
  ["Uber to the airport", "transport_rideshare"],
  ["Bolt home", "transport_rideshare"],
  ["Taxi", "transport_rideshare"],
  ["Petrol — airport run", "transport_fuel"],
  ["Engen", "transport_fuel"],
  ["Shell garage", "transport_fuel"],
  ["Diesel", "transport_fuel"],
  ["Fill up", "transport_fuel"],
  ["Parking", "transport_parking"],
  ["E-toll", "transport_parking"],
  ["etoll", "transport_parking"],
  ["e toll", "transport_parking"],
  ["Car guard", "transport_parking"],
  ["Speeding fine", "transport_parking"],
  ["Gautrain", "transport_public"],
  ["Gautrain card top up", "transport_public"],
  ["MyCiTi bus", "transport_public"],
  ["Taxi fare", "transport_public"],
  ["Car service", "transport_car"],
  ["New tyres", "transport_car"],
  ["Car wash", "transport_car"],
  ["Licence disc", "transport_car"],
  ["Car", "transport"],
  ["Car instalment", "transport"],

  // --- Groceries ---
  ["Checkers big shop", "groceries"],
  ["Woolworths month-end", "groceries"],
  ["Woolies", "groceries"],
  ["Pick n Pay", "groceries"],
  ["Pick 'n Pay", "groceries"],
  ["PnP", "groceries"],
  ["Spar", "groceries"],
  ["Groceries", "groceries"],
  ["Cheese", "groceries"],
  ["Milk and bread", "groceries"],
  ["Chicken and veggies", "groceries"],
  ["Coffee", "groceries"],
  ["Coffee beans", "groceries"],
  ["Tea", "groceries"],
  ["Groceries for dinner", "groceries"],
  ["Melk en brood", "groceries"],
  ["Sixty60 order", "groceries"],
  ["Checkers: milk, bread, eggs, wine", "groceries"],
  ["Chocolate bar", "groceries"],
  ["Coke", "groceries"],
  ["Butternut squash", "groceries"],
  ["Apples", "groceries"],
  ["Strawberries", "groceries"],
  ["Tops liquor", "groceries_liquor"],
  ["Wine at Checkers", "groceries_liquor"],
  ["Wine", "groceries_liquor"],
  ["Castle Lite case", "groceries_liquor"],
  ["Bottle store", "groceries_liquor"],
  ["Gin and tonic", "groceries_liquor"],
  ["Savanna", "groceries_liquor"],
  ["Groceries and wine", "groceries"],
  ["Braai pack & wood", "groceries_butcher"],
  ["butcher braai pack", "groceries_butcher"],
  ["Biltong", "groceries_butcher"],
  ["Cleaning supplies", "groceries_consumables"],
  ["Toilet paper", "groceries_consumables"],
  ["Washing powder", "groceries_consumables"],
  ["Bin bags and foil", "groceries_consumables"],

  // --- Household ---
  ["SweepSouth deep clean", "household_cleaning"],
  ["Domestic helper (weekly)", "household_cleaning"],
  ["Gardener", "household_cleaning"],
  ["Dry cleaning", "household_cleaning"],
  ["ADT armed response", "household_security"],
  ["Electric fence repair", "household_security"],
  ["Alarm", "household_security"],
  ["Builders — new kettle & globes", "household_maintenance"],
  ["Builders Warehouse", "household_maintenance"],
  ["Plumber", "household_maintenance"],
  ["Geyser repair", "household_maintenance"],
  ["Nuts and bolts", "household_maintenance"],
  ["Bolts", "household_maintenance"],
  ["Electrician", "household_maintenance"],
  ["Paint", "household_maintenance"],
  ["Inverter", "household_maintenance"],
  ["Pool chemicals", "household_maintenance"],
  ["New couch", "household_furniture"],
  ["Mattress", "household_furniture"],
  ["Coffee table", "household_furniture"],
  ["Kettle", "household_furniture"],
  ["Air fryer", "household_furniture"],
  ["Coffee machine", "household_furniture"],
  ["Mr Price Home towels", "household_furniture"],
  ["@home", "household_furniture"],
  ["Washing machine", "household_furniture"],
  ["Plants from the nursery", "household_garden"],
  ["Stodels", "household_garden"],
  ["Compost", "household_garden"],
  ["Clicks", "household_pharmacy"],
  ["Dis-Chem", "household_pharmacy"],
  ["Dischem", "household_pharmacy"],
  ["Dis Chem", "household_pharmacy"],
  ["Shampoo and toothpaste", "household_pharmacy"],
  ["Nappies", "household_pharmacy"],
  ["Prescription meds", "household_pharmacy"],
  ["Toiletries", "household_pharmacy"],
  ["Household", "household"],

  // --- Leisure ---
  ["Cinema — new release", "entertainment_movies"],
  ["Ster Kinekor", "entertainment_movies"],
  ["Ster-Kinekor", "entertainment_movies"],
  ["sterkinekor", "entertainment_movies"],
  ["Nu Metro", "entertainment_movies"],
  ["Movie tickets", "entertainment_movies"],
  ["Theatre", "entertainment_movies"],
  ["Concert tickets", "entertainment_events"],
  ["Computicket", "entertainment_events"],
  ["Tickets", "entertainment_events"],
  ["Comedy show", "entertainment_events"],
  ["Comedy club", "entertainment_events"],
  ["Steam game", "entertainment_gaming"],
  ["PS5 game", "entertainment_gaming"],
  ["Xbox Game Pass", "entertainment_gaming"],
  ["Robux", "entertainment_gaming"],
  ["Virgin Active gym", "entertainment_sport"],
  ["Gym", "entertainment_sport"],
  ["Gym subscription", "entertainment_sport"],
  ["Padel", "entertainment_sport"],
  ["Golf club fees", "entertainment_sport"],
  ["Parkrun", "entertainment_sport"],
  ["Running shoes", "entertainment_sport"],
  ["flight to Cape Town", "other_travel"],
  ["Flights", "other_travel"],
  ["Airbnb", "other_travel"],
  ["Booking.com", "other_travel"],
  ["Hotel", "other_travel"],
  ["FlySafair", "other_travel"],
  ["Car hire", "other_travel"],
  ["Game drive", "other_travel"],
  ["Weekend away", "other_travel"],
  ["Kruger park fees", "other_travel"],
  ["Exclusive Books", "leisure_hobbies"],
  ["Books", "leisure_hobbies"],
  ["Museum", "leisure_hobbies"],
  ["Board games", "leisure_hobbies"],
  ["Mini golf", "leisure_hobbies"],
  ["Wine tasting", "leisure_hobbies"],
  ["Escape room", "leisure_hobbies"],
  ["Kirstenbosch", "leisure_hobbies"],

  // --- Other ---
  ["Doctor", "other_medical"],
  ["GP visit", "other_medical"],
  ["Dentist", "other_medical"],
  ["Physiotherapy", "other_medical"],
  ["Optometrist", "other_medical"],
  ["Blood test", "other_medical"],
  ["Bank charges", "other_fees"],
  ["ATM fee", "other_fees"],
  ["SARS", "other_admin"],
  ["Passport", "other_admin"],
  ["Drivers licence renewal", "other_admin"],
  ["Lawyer", "other_admin"],
  ["Sipho's birthday gift (from the flat)", "other_gifts"],
  ["Birthday present", "other_gifts"],
  ["Flowers", "other_gifts"],
  ["Donation", "other_gifts"],
  ["Gift card", "other_gifts"],
  ["School fees", "other_kids"],
  ["Creche", "other_kids"],
  ["Crèche", "other_kids"],
  ["Babysitter", "other_kids"],
  ["Toys", "other_kids"],
  ["Stationery", "other_kids"],
  ["Vet", "other_pets"],
  ["Dog food", "other_pets"],
  ["Cat litter", "other_pets"],
  ["Royal Canin", "other_pets"],
  ["Mr Price jeans", "other_clothing"],
  ["Woolworths jeans", "other_clothing"],
  ["New shoes", "other_clothing"],
  ["Takkies", "other_clothing"],
  ["Cotton On", "other_clothing"],
  ["H&M", "other_clothing"],
  ["Nike", "other_clothing"],
  ["Puma sneakers", "other_clothing"],
  ["Haircut", "other_personal"],
  ["Barber", "other_personal"],
  ["Nails", "other_personal"],
  ["Massage", "other_personal"],
  ["Laptop", "other_tech"],
  ["iPhone case", "other_tech"],
  ["Phone charger", "other_tech"],
  ["Incredible Connection", "other_tech"],
  ["Apple Watch", "other_tech"],
  ["Takealot", "other_shopping"],
  ["Takealot kettle", "household_furniture"],
  ["Temu order", "other_shopping"],
  ["PostNet courier", "other_shopping"],
  ["mystery purchase", "other"],
  ["Misc", "other"],
  // --- Phase 18 §5a: words found sitting in Other ---
  ["Ontbyt saam met vriende", "eatingout_restaurant"],
  ["Middagete", "eatingout_restaurant"],
  ["Brekkie", "eatingout_restaurant"],
  ["Goulash and langos", "eatingout_restaurant"],
  ["Pierogi", "eatingout_restaurant"],
  ["Tandeborsels", "household_pharmacy"],
  ["Tandepasta", "household_pharmacy"],
  ["Bokashi bran", "household_garden"],
  ["Worm farm", "household_garden"],
  ["Poo bags", "other_pets"],
  ["Hondekos", "other_pets"],
  ["Multi-plug", "household_maintenance"],
  ["Multiplug", "household_maintenance"],
  ["Spare keys cut", "household_maintenance"],
  ["Key copies", "household_maintenance"],
  ["Super glue", "household_maintenance"],
  ["The Labia", "entertainment_movies"],
  ["Chess club", "leisure_hobbies"],
  ["Braaihout", "groceries_consumables"],
  // Stretched for emphasis: the run collapses before matching.
  ["Driiiinks", "eatingout_drinks"],
  ["Spicessss", "groceries"],
  ["Coffeeee beans", "groceries"],
];

/** Things that used to (or easily could) mis-file — each guards a specific trap. */
const TRAPS: [string, string, string][] = [
  ["cardigan", "other", "car ✗ cardigan (no bare substring)"],
  ["steamed buns", "groceries", "tea/steam ✗ — and steamed is not Steam"],
  ["virgin mojito", "other", "gin ✗ virgin"],
  ["Laptop update", "other_tech", "squash can't spell 'top up' inside laptop"],
  ["Team dinner", "eatingout_restaurant", "team is not a typo of steam"],
  ["Total for the month", "other", "Total the word is not Total the garage"],
  ["Premium coffee beans", "groceries", "premium alone is weak evidence for insurance"],
  ["Dinner at home", "eatingout_restaurant", "'at home' is not @home"],
  ["Furniture delivery", "household_furniture", "delivery alone isn't takeaway"],
  ["Flight ticket", "other_travel", "ticket alone is weak"],
  ["Pet insurance", "bills_insurance", "insurance product, not a pet expense"],
  ["Electrician", "household_maintenance", "electric ✗ electrician"],
  ["Gardener", "household_cleaning", "garden ✗ gardener"],
  ["Apple Music", "entertainment_streaming", "not the fruit"],
  ["Apple", "groceries", "the fruit"],
  ["Uber Eats", "eatingout_takeaway", "phrase beats the bare brand, regardless of order"],
  ["Wine glasses", "household_furniture", "glassware, not liquor"],
  ["Electric blanket", "household_furniture", "not electricity"],
  ["Car seat", "other_kids", "not the car"],
  ["Car rental", "other_travel", "not rent, not the car"],
  ["Security deposit", "rent_deposit", "not armed response"],
  ["Nursery school", "other_kids", "not a plant nursery"],
  ["Comedy club", "entertainment_events", "not a nightclub"],
  ["Golf club", "entertainment_sport", "not a nightclub"],
  ["Protein bar", "groceries", "not a bar"],
  ["Hot chocolate", "eatingout_coffee", "a café drink, not a slab"],
  ["Fish food", "other_pets", "not fish for dinner"],
  ["Dog show", "other_pets", "show is weak"],
  ["Gautrain top up", "transport_public", "top up alone is not airtime"],
  ["Bolt Food", "eatingout_takeaway", "Bolt's food delivery, not a ride"],
  ["Puma Energy", "transport_fuel", "the garage, not the shoe"],
  ["Rain", "utilities_mobile", "bare Rain is the network"],
];

describe("autoCategory — golden corpus", () => {
  it.each(CORPUS)("%s → %s", (desc, expected) => {
    expect(autoCategory(desc)).toBe(expected);
  });
});

describe("autoCategory — traps", () => {
  it.each(TRAPS)("%s → %s (%s)", (desc, expected) => {
    expect(autoCategory(desc)).toBe(expected);
  });
});

describe("library integrity", () => {
  it("every pickable subcategory with vocabulary is reachable by at least one of its own words", () => {
    for (const sub of SUBCATEGORIES) {
      const words = [...(sub.brands ?? []), ...sub.keywords, ...(sub.weak ?? []), ...(sub.retailers ?? [])];
      if (words.length === 0) continue;
      expect(words.some((w) => autoCategory(w) === sub.slug), sub.slug).toBe(true);
    }
  });

  it("every brand and keyword, typed alone, files under its own subcategory", () => {
    // Weak words and retailers are excluded on purpose — they're allowed to
    // lose to a stronger reading of the same word elsewhere.
    const misfiled: string[] = [];
    for (const sub of SUBCATEGORIES) {
      for (const w of [...(sub.brands ?? []), ...sub.keywords]) {
        const got = autoCategory(w);
        if (got !== sub.slug) misfiled.push(`${w} → ${got} (listed under ${sub.slug})`);
      }
    }
    expect(misfiled).toEqual([]);
  });

  it("no word is listed twice", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const sub of SUBCATEGORIES) {
      for (const w of [...(sub.brands ?? []), ...sub.keywords, ...(sub.weak ?? []), ...(sub.retailers ?? [])]) {
        const k = w.toLowerCase().trim();
        if (seen.has(k)) dupes.push(`${k}: ${seen.get(k)} + ${sub.slug}`);
        else seen.set(k, sub.slug);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("no entry has a letter three times in a row (they'd never match: input runs collapse)", () => {
    const stretched = SUBCATEGORIES.flatMap((sub) =>
      [...(sub.brands ?? []), ...sub.keywords, ...(sub.weak ?? []), ...(sub.retailers ?? [])].filter((w) =>
        /([a-z])\1\1/i.test(w)
      )
    );
    expect(stretched).toEqual([]);
  });

  it("is a massive library", () => {
    const total = SUBCATEGORIES.reduce(
      (n, s) => n + s.keywords.length + (s.brands?.length ?? 0) + (s.weak?.length ?? 0) + (s.retailers?.length ?? 0),
      0
    );
    expect(total).toBeGreaterThan(1500);
  });

  it("the picker hides legacy aliases but keeps every live subcategory", () => {
    const picker = PARENT_CATEGORIES.flatMap((p) => CATEGORY_TREE[p].map((s) => s.slug));
    expect(picker).not.toContain("other_insurance");
    expect(picker.length).toBe(SUBCATEGORIES.filter((s) => !s.legacy).length);
  });
});

describe("scoreCategory — confidence signal (Phase 18 §3)", () => {
  it("a clean brand is confident", () => {
    const s = scoreCategory("Netflix");
    expect(s.slug).toBe("entertainment_streaming");
    expect(s.score - s.runnerUp).toBeGreaterThanOrEqual(1);
  });
  it("a bare retailer is a weak guess with alternatives", () => {
    const s = scoreCategory("Clicks");
    expect(s.score).toBeLessThan(1);
  });
  it("offers up to three candidates, strongest first", () => {
    const s = scoreCategory("Woolworths sushi and wine");
    expect(s.candidates.length).toBeGreaterThan(1);
    expect(s.candidates.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < s.candidates.length; i++) {
      expect(s.candidates[i - 1].score).toBeGreaterThanOrEqual(s.candidates[i].score);
    }
  });
  it("squashing never spells a phrase across a word boundary", () => {
    // "drinking games" squashes to "drinkinggames", which contains "ingame":
    // only the weak word "games" may count, never the in-game phrase (3).
    expect(scoreCategory("drinking games").score).toBeLessThan(1);
  });
  it("nothing matched → no candidates", () => {
    expect(scoreCategory("asdfgh").candidates).toEqual([]);
  });
  it("is fast enough to run on every keystroke", () => {
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) autoCategory("Woolworths groceries and a bottle of wine for dinner");
    expect((performance.now() - t0) / 500).toBeLessThan(2);
  });
});
