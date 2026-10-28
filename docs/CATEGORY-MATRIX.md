# Tally — expense → category matrix

A readable snapshot of [`settleup/src/lib/domain/category.ts`](../settleup/src/lib/domain/category.ts), which is the source of truth. **Regenerate this file whenever that one changes** (`npm run gen:category-matrix` in `settleup/`). The counts and word lists are generated, not hand-edited, so they can't drift by typo; the audit and notes are written by hand.

**7 parents · 54 pickable subcategories · 2 369 vocabulary entries.** Engine: the scoring matcher from [ADR-0019](decisions/0019-learning-categorisation-engine.md) / [Phase 18 §1](phases/phase-18-learning-categorisation.md#1--swap-the-matcher-engine). Learning, the ambiguity UI and user-added assignments come later: see [the audit](#requirements-audit) below.

## How a description becomes a category

Every subcategory is **scored** against the description, and the strongest evidence wins. Registry order only breaks exact ties, so a keyword can be added anywhere without reordering anything.

| Tier | Weight | What belongs here | Typo-tolerant? |
| --- | --- | --- | --- |
| **Brands** | 2 per one-word name; phrase = words + 1 | Distinctive merchants (Netflix, Engen, Dis-Chem), or a word that names the bucket outright ("groceries") | Yes, one letter off, from 6 letters (`netflx`, `nandoos`), scored ×0.75 |
| **Keywords** | 1 per word; phrase = words + 1 | What was bought: "cheese", "car service", "flat white" | Yes, from 7 letters, ×0.75 |
| **Weak** | 0.75 | Ambiguous words that only decide when nothing better is there: "dinner", "bar", "ticket", "prepaid" | No |
| **Retailers** | 0.5 | Multi-purpose stores. They say *where*, not *what*: Checkers, Woolworths, Clicks, Takealot | Yes, from 6 letters |

Worked examples:

- `Wine at Checkers`: wine (1) beats checkers (0.5) → **Liquor**
- `Groceries for dinner`: groceries (2) beats dinner (0.75) → **Supermarket**
- `Uber Eats`: the phrase (3) beats bare *uber* (2) → **Takeaway**, wherever the two sit in the file
- `Takealot kettle`: kettle (1) beats takealot (0.5) → **Furniture, décor & appliances**

Matching rules:

- **Normalised.** Lower-cased and accent-stripped (`café` = `cafe`). Phrases also match with separators removed (`ster kinekor` = `ster-kinekor` = `sterkinekor`, `e toll` = `etoll`), but only on whole-word boundaries, so `drinking games` can never spell *in-game*.
- **Stretched letters collapse.** A letter typed three or more times in a row becomes one (two, if only that is a known word), so `driiinks` = `drinks` and `spicessss` = `spices`. Real doubles (`coffee`) are untouched.
- **Word-aware.** A single word hits a whole token, its plural, or a ≥6-letter prefix (`grocer` → *groceries*). It never hits a bare substring (`car` ✗ *cardigan*, `tea` ✗ *steam*).
- **A known word is only ever itself.** If the library lists a token exactly, the engine won't read it as some other keyword's plural, prefix or typo: *bolts* is hardware, not *bolt* the rideshare; *electrician* is not *electric*.
- **Credited once.** Within a subcategory each word counts once, at its strongest reading: `car insurance` scores the phrase (3), not phrase + *insurance*.
- **Nothing matched** → `other`.

`scoreCategory(desc)` also returns the runner-up score and the top three candidates. That's the confidence signal Phase 18 §3's "is it one of these?" chip row needs.

## Requirements audit

Everything asked of categorisation across the ADRs, phase specs and requests, checked against the code as of this snapshot.

| # | Requirement | Source | Status | Where / note |
| --- | --- | --- | --- | --- |
| 1 | Category inferred from the description; entering an expense needs no extra steps | ADR-0008 | ✅ Built | `autoCategory` runs on every keystroke in the Add sheet |
| 2 | Two-level taxonomy; tap the chip to override with a grouped picker | ADR-0011 | ✅ Built | `category-picker-sheet.tsx` |
| 3 | Seven intuitive parents; Bills & rent is the monthly bucket; Entertainment → Leisure | ADR-0011 rev. | ✅ Built | `CATEGORY_META` |
| 4 | Big grocery vocabulary ("cheese", "chicken", "bread" → Groceries) | ADR-0011 rev., Josh | ✅ Built | Expanded again here: the Supermarket bucket went from 170 to 385 entries |
| 5 | Legacy slugs still resolve; no migration | ADR-0011 | ✅ Built | Now flagged `legacy` and hidden from the picker (see #14) |
| 6 | Scoring engine instead of first match | ADR-0019, Phase 18 §1 | ✅ Built | Ported from the vendored reference, with the fixes in #15 |
| 7 | Separator- and accent-insensitive matching | Phase 18 §1 | ✅ Built | Separator-free matching is now word-boundary-safe |
| 8 | Retailers weighted low, so the item bought wins | Phase 18 §1 | ✅ Built | Now its own `retailers` tier per subcategory |
| 9 | Distinctive brands stronger and typo-tolerant | Phase 18 §1 | ✅ Built | Now its own `brands` tier per subcategory; no separate set to keep in sync |
| 10 | `scoreCategory` exposes `{ score, runnerUp }` | Phase 18 §1 | ✅ Built | Exported, and adds `candidates` (top three) for §3 |
| 11 | Six regression tests (ster kinekor, uber eats, wine at checkers, netflx, cardigan, steam) | Phase 18 §1 | ✅ Built | `category.test.ts` → "Phase 18 §1 engine guarantees" |
| 12 | A "massive" library | Josh, this request | ✅ Built | 2 339 entries, up from 439, guarded by a ~300-case golden corpus and library-integrity tests (`category-corpus.test.ts`) |
| 13 | Common spending with nowhere to go (clothes, haircuts, electronics, online orders, tax/legal, loan repayments) | Audit finding: these were landing in *Other* | ✅ Built | Six new subcategories, all under existing parents (see the *Taxonomy change* note) |
| 14 | The picker showed **two** "Insurance" chips under Bills | Audit finding: `other_insurance` alias | ✅ Fixed | `legacy: true` keeps it resolvable but out of `CATEGORY_TREE` |
| 15 | Bugs in the vendored reference engine | Audit finding | ✅ Fixed | (a) typo matching applied to *every* word ≥5 letters, not only brands as its own docs said, so "team" read as "steam"; (b) separator-free matching ignored word boundaries ("laptop update" spelled *top up*; "drinking games" spelled *in-game*); (c) bare "coffee" went to Café, breaking the existing coffee → Groceries test; (d) generic words hijacked results ("Total for the month" → fuel, "Premium coffee" → insurance, "Dinner at home" → furniture, "Furniture delivery" → takeaway) |
| 16 | Learned corrections: Tally-local now, global on 3/3/70% consensus | ADR-0019, Phase 18 §2 | ❌ Not built | Needs the migration, RPC and term extraction |
| 17 | Ambiguity: offer the top candidates when the margin is thin | Phase 18 §3 | 🟡 Half | Domain signal ready (`candidates`); thresholds and chip row not built |
| 18 | Report filter by subcategory | Phase 18 §4 | ❌ Not built | `ReportFilters.categories` is still parent-only |
| 19 | `category_source` provenance + fallback-only backfill | Phase 18 §5 | ✅ Built | Run 2026-10-28 (36 rows): *Other* went from 38% of spend to 11%. `npm run backfill:categories`; every change logged in `category_backfill` and reversible |
| 20 | Regenerate this matrix after the engine swap | Phase 18 step 10 | ✅ Done | This file |
| 21 | User adds their own category assignment ("always file *Vida* as Coffee") | Josh, this request | 📝 Spec only | UI flow notes: [Phase 19](phases/phase-19-category-assignments.md) |
| 22 | Privacy policy names the global rule table | ADR-0019 | ❌ Not built | Blocked on #16; tracked in BACKLOG |
| 23 | Everyday words that were landing in *Other* (Afrikaans meal and toiletry words, common dishes, pet, garden and hardware odds and ends) | Phase 18 §5a measurement | ✅ Built | 30 entries; generic vocabulary only, never a name |
| 24 | Emphasis spellings ("driiinks") | Phase 18 §5a measurement | ✅ Built | Stretched letters collapse before matching |

**Taxonomy change.** Phase 18 listed "no taxonomy change" as a non-goal. #13 adds subcategories, not parents: the seven parents, their colours and their Phase 11 glyphs are untouched, and no stored slug changes meaning. Two existing labels widened to match what they now hold: *Parking & tolls* → *Parking, tolls & fines*, and *Furniture & décor* → *Furniture, décor & appliances*. The change is recorded as a revision in [ADR-0011](decisions/0011-two-level-categories.md).

## Parents at a glance

| # | Parent | Slug | Icon | Colour token | Subcategories | Vocabulary |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Groceries | `groceries` | 🛒 | `var(--cat-groceries)` | 4 | 577 |
| 2 | Eating out | `eatingout` | 🍝 | `var(--cat-eatingout)` | 5 | 189 |
| 3 | Bills & rent | `bills` | 🏠 | `var(--cat-rent)` | 14 | 265 |
| 4 | Transport | `transport` | 🚗 | `var(--cat-transport)` | 6 | 155 |
| 5 | Household | `household` | 🧴 | `var(--cat-household)` | 7 | 396 |
| 6 | Leisure | `leisure` | 🎬 | `var(--cat-entertainment)` | 7 | 293 |
| 7 | Other | `other` | 💳 | `var(--cat-other)` | 11 | 494 |

## Matrix overview

Registry order. Each subcategory's full vocabulary is listed in [By subcategory](#by-subcategory).

| Parent | Subcategory | Stored slug | Brands | Keywords | Weak | Retailers |
| --- | --- | --- | --- | --- | --- | --- |
| Bills & rent | Rent / bond | `rent` | 0 | 17 | 0 | 0 |
| Bills & rent | Levies & rates | `rent_levies` | 0 | 10 | 1 | 0 |
| Bills & rent | Deposit | `rent_deposit` | 0 | 5 | 0 | 0 |
| Bills & rent | Electricity / prepaid | `utilities_electricity` | 3 | 10 | 2 | 0 |
| Bills & rent | Water & municipal | `utilities_water` | 3 | 19 | 1 | 0 |
| Bills & rent | Internet / fibre | `utilities_internet` | 13 | 13 | 0 | 0 |
| Bills & rent | Mobile / airtime | `utilities_mobile` | 7 | 15 | 5 | 0 |
| Bills & rent | DSTV / TV licence | `utilities_tv` | 6 | 4 | 0 | 0 |
| Bills & rent | Insurance | `bills_insurance` | 20 | 17 | 2 | 0 |
| Bills & rent | Medical aid | `bills_medical` | 12 | 4 | 2 | 0 |
| Bills & rent | Loans & credit | `bills_debt` | 5 | 14 | 0 | 0 |
| Bills & rent | Streaming & subscriptions | `entertainment_streaming` | 19 | 17 | 3 | 0 |
| Bills & rent | Utilities (other) | `utilities` | 3 | 9 | 0 | 0 |
| Bills & rent | Bill (other) | `bills` | 0 | 0 | 4 | 0 |
| Eating out | Takeaway / delivery | `eatingout_takeaway` | 37 | 19 | 3 | 0 |
| Eating out | Coffee & café | `eatingout_coffee` | 16 | 19 | 0 | 0 |
| Eating out | Bars & drinks | `eatingout_drinks` | 0 | 19 | 5 | 0 |
| Eating out | Restaurant | `eatingout_restaurant` | 23 | 32 | 13 | 0 |
| Eating out | Eating out (other) | `eatingout` | 0 | 0 | 3 | 0 |
| Transport | Uber / Bolt / taxi | `transport_rideshare` | 6 | 6 | 3 | 0 |
| Transport | Fuel / petrol | `transport_fuel` | 12 | 12 | 1 | 0 |
| Transport | Parking, tolls & fines | `transport_parking` | 3 | 20 | 2 | 0 |
| Transport | Gautrain / public | `transport_public` | 17 | 18 | 0 | 0 |
| Transport | Car service & upkeep | `transport_car` | 13 | 34 | 0 | 0 |
| Transport | Transport (other) | `transport` | 0 | 5 | 3 | 0 |
| Groceries | Liquor | `groceries_liquor` | 28 | 40 | 3 | 0 |
| Groceries | Meat & butcher | `groceries_butcher` | 0 | 22 | 2 | 0 |
| Groceries | Household consumables | `groceries_consumables` | 0 | 64 | 1 | 0 |
| Groceries | Supermarket | `groceries` | 3 | 382 | 3 | 29 |
| Household | Cleaning & domestic help | `household_cleaning` | 2 | 20 | 3 | 0 |
| Household | Security & armed response | `household_security` | 9 | 18 | 1 | 0 |
| Household | Maintenance & hardware | `household_maintenance` | 19 | 74 | 9 | 0 |
| Household | Furniture, décor & appliances | `household_furniture` | 27 | 75 | 7 | 0 |
| Household | Garden | `household_garden` | 4 | 27 | 3 | 0 |
| Household | Pharmacy & toiletries | `household_pharmacy` | 23 | 66 | 3 | 1 |
| Household | Household (other) | `household` | 0 | 0 | 5 | 0 |
| Leisure | Movies & shows | `entertainment_movies` | 12 | 15 | 2 | 0 |
| Leisure | Events & tickets | `entertainment_events` | 9 | 17 | 2 | 0 |
| Leisure | Games | `entertainment_gaming` | 9 | 26 | 3 | 0 |
| Leisure | Sport & fitness | `entertainment_sport` | 10 | 47 | 3 | 0 |
| Leisure | Travel & accommodation | `other_travel` | 27 | 42 | 4 | 0 |
| Leisure | Hobbies & outings | `leisure_hobbies` | 7 | 47 | 8 | 0 |
| Leisure | Leisure (other) | `entertainment` | 0 | 0 | 3 | 0 |
| Other | Doctor & medical | `other_medical` | 11 | 46 | 5 | 0 |
| Other | Bank & fees | `other_fees` | 0 | 18 | 10 | 0 |
| Other | Tax, legal & admin | `other_admin` | 0 | 27 | 3 | 0 |
| Other | Gifts & donations | `other_gifts` | 1 | 26 | 6 | 0 |
| Other | Kids & school | `other_kids` | 3 | 41 | 6 | 0 |
| Other | Pets | `other_pets` | 10 | 39 | 2 | 0 |
| Other | Clothing & shoes | `other_clothing` | 39 | 43 | 8 | 0 |
| Other | Hair & personal care | `other_personal` | 4 | 34 | 3 | 0 |
| Other | Electronics & tech | `other_tech` | 22 | 48 | 8 | 0 |
| Other | Online & general shopping | `other_shopping` | 13 | 6 | 3 | 5 |
| Bills & rent | Insurance *(legacy alias, hidden)* | `other_insurance` | 0 | 0 | 0 | 0 |
| Other | Other | `other` | 0 | 0 | 4 | 0 |

## By subcategory

### 🛒 Groceries — `groceries`

#### Liquor — `groceries_liquor`

- **Brands:** `norman goodfellows`, `ultra liquors`, `liquor city`, `amarula`, `klipdrift`, `klippies`, `jameson`, `johnnie walker`, `jack daniels`, `smirnoff`, `absolut`, `bacardi`, `captain morgan`, `savanna`, `hunters dry`, `hunters gold`, `castle`, `castle lite`, `black label`, `carling`, `heineken`, `windhoek`, `amstel`, `stella artois`, `corona`, `flying fish`, `brutal fruit`, `redds`
- **Keywords:** `liquor`, `liquor store`, `liquorshop`, `bottle store`, `bottlestore`, `tops at spar`, `spar tops`, `makro liquor`, `checkers liquor`, `checkers liquorshop`, `pick n pay liquor`, `wine`, `red wine`, `white wine`, `bubbly`, `champagne`, `prosecco`, `sparkling wine`, `beer`, `beers`, `lager`, `craft beer`, `cider`, `ciders`, `whisky`, `whiskey`, `vodka`, `gin`, `rum`, `brandy`, `tequila`, `jagermeister`, `sherry`, `spirits`, `alcohol`, `booze`, `six pack`, `case of beer`, `crate of beer`, `wine case`
- **Weak:** `tops`, `dop`, `mcc`

#### Meat & butcher — `groceries_butcher`

- **Keywords:** `butcher`, `butchery`, `meat market`, `braai pack`, `braaipack`, `braai meat`, `braai`, `chops`, `lamb chops`, `pork chops`, `ribs`, `spare ribs`, `t-bone`, `rump`, `sirloin`, `brisket`, `pork belly`, `charcuterie`, `biltong`, `droewors`, `drywors`, `game meat`
- **Weak:** `deli`, `meat`

#### Household consumables — `groceries_consumables`

- **Keywords:** `toilet paper`, `toilet roll`, `toilet rolls`, `loo roll`, `cleaning supplies`, `cleaning products`, `dishwash`, `dishwashing liquid`, `dish soap`, `washing powder`, `washing liquid`, `laundry detergent`, `detergent`, `fabric softener`, `fabric conditioner`, `sunlight liquid`, `handy andy`, `domestos`, `jik`, `bleach`, `mr muscle`, `doom`, `baygon`, `air freshener`, `glade`, `cling wrap`, `cling film`, `foil`, `tin foil`, `aluminium foil`, `bin bags`, `refuse bags`, `black bags`, `garbage bags`, `paper towel`, `paper towels`, `kitchen towel`, `serviettes`, `napkins`, `tissues`, `sponges`, `steel wool`, `scourer`, `dishwasher tablets`, `finish tablets`, `surface spray`, `disinfectant`, `dettol`, `omo`, `ariel`, `maq`, `sta-soft`, `vanish`, `batteries`, `battery`, `candles`, `rat poison`, `ant poison`, `insect spray`, `firelighters`, `charcoal`, `firewood`, `braai wood`, `braaihout`
- **Weak:** `wood`

#### Supermarket — `groceries`

- **Brands:** `groceries`, `grocery`, `grocer`
- **Keywords:** `supermarket`, `big shop`, `monthly shop`, `weekly shop`, `grocery shop`, `grocery run`, `food shopping`, `ingredients`, `farmers market`, `spaza`, `spaza shop`, `corner shop`, `boodskappe`, `milk`, `long life milk`, `fresh milk`, `bread`, `loaf`, `eggs`, `egg`, `butter`, `margarine`, `cheese`, `cheddar`, `gouda`, `feta`, `mozzarella`, `parmesan`, `halloumi`, `cream cheese`, `cottage cheese`, `yoghurt`, `yogurt`, `cream`, `sour cream`, `amasi`, `maas`, `buttermilk`, `melk`, `brood`, `kaas`, `eiers`, `rice`, `basmati`, `pasta`, `spaghetti`, `macaroni`, `penne`, `lasagne`, `noodles`, `two minute noodles`, `flour`, `cake flour`, `bread flour`, `maize`, `mielie meal`, `maize meal`, `pap`, `samp`, `oats`, `cereal`, `weetbix`, `weet-bix`, `pronutro`, `cornflakes`, `muesli`, `granola`, `sugar`, `brown sugar`, `salt`, `pepper`, `spice`, `spices`, `curry powder`, `cooking oil`, `olive oil`, `sunflower oil`, `vinegar`, `tomato sauce`, `ketchup`, `mayo`, `mayonnaise`, `mustard`, `chutney`, `jam`, `honey`, `syrup`, `peanut butter`, `marmite`, `bovril`, `stock cube`, `stock cubes`, `gravy`, `soup`, `pasta sauce`, `tinned tomatoes`, `baked beans`, `canned`, `tinned`, `ice`, `bag of ice`, `baking powder`, `bicarb`, `yeast`, `vanilla`, `cocoa`, `icing sugar`, `custard`, `jelly`, `condensed milk`, `frozen veg`, `frozen vegetables`, `frozen pizza`, `fish fingers`, `oven chips`, `pizza base`, `chicken`, `chicken breast`, `chicken thighs`, `chicken wings`, `whole chicken`, `beef`, `mince`, `steak`, `pork`, `lamb`, `sausage`, `sausages`, `boerewors`, `wors`, `bacon`, `ham`, `polony`, `viennas`, `russians`, `fish`, `hake`, `tuna`, `salmon`, `kingklip`, `snoek`, `prawns`, `calamari`, `pilchards`, `sardines`, `tofu`, `vleis`, `hoender`, `vegetables`, `veggies`, `veg`, `fruit`, `fruits`, `groente`, `vrugte`, `apple`, `apples`, `banana`, `bananas`, `orange`, `oranges`, `naartjie`, `naartjies`, `grapes`, `berries`, `strawberry`, `strawberries`, `blueberry`, `blueberries`, `raspberry`, `raspberries`, `pear`, `pears`, `peach`, `peaches`, `plums`, `nectarines`, `mango`, `mangoes`, `pineapple`, `watermelon`, `melon`, `kiwi`, `litchis`, `tomato`, `tomatoes`, `potato`, `potatoes`, `sweet potato`, `onion`, `onions`, `carrot`, `carrots`, `lettuce`, `spinach`, `cabbage`, `broccoli`, `cauliflower`, `cucumber`, `butternut`, `butternut squash`, `gem squash`, `pumpkin`, `zucchini`, `baby marrows`, `peppers`, `green pepper`, `avocado`, `avo`, `avos`, `garlic`, `ginger`, `chilli`, `lemon`, `lemons`, `lime`, `mushroom`, `mushrooms`, `corn`, `mielies`, `beans`, `green beans`, `lentils`, `chickpeas`, `peas`, `herbs`, `coriander`, `basil`, `salad`, `rocket`, `beetroot`, `bakery`, `rolls`, `bread rolls`, `buns`, `cake`, `muffin`, `muffins`, `croissant`, `croissants`, `biscuit`, `biscuits`, `cookies`, `rusks`, `chocolate`, `chocolate bar`, `sweets`, `candy`, `snacks`, `nuts`, `peanuts`, `cashews`, `popcorn`, `chips`, `crisps`, `ice cream`, `juice`, `cooldrink`, `cooldrinks`, `cold drink`, `cold drinks`, `soft drinks`, `soda`, `fizzy`, `coffee`, `coffee beans`, `coffee pods`, `instant coffee`, `nespresso pods`, `tea`, `tea bags`, `rooibos`, `koffie`, `sparkling water`, `bottled water`, `still water`, `mineral water`, `energy drink`, `energy drinks`, `protein bar`, `granola bar`, `baby food`, `formula`, `baby formula`, `simba`, `nik naks`, `niknaks`, `doritos`, `lays`, `pringles`, `fritos`, `ghost pops`, `oreo`, `kitkat`, `kit kat`, `bar one`, `cadbury`, `lindt`, `beacon`, `jelly tots`, `smarties`, `chappies`, `stimorol`, `mentos`, `astros`, `tennis biscuits`, `marie biscuits`, `eet-sum-mor`, `provita`, `salticrax`, `ouma rusks`, `nutella`, `black cat peanut butter`, `sasko`, `albany bread`, `blue ribbon`, `clover`, `parmalat`, `danone`, `ultra mel`, `fatti's & moni's`, `koo`, `all gold`, `rhodes`, `i&j`, `mccain`, `rainbow chicken`, `county fair`, `tastic`, `spekko`, `white star`, `iwisa`, `ace maize`, `jungle oats`, `kellogg's`, `bokomo`, `nestle`, `nescafe`, `ricoffy`, `frisco`, `five roses`, `joko`, `freshpak`, `lipton`, `tropika`, `oros`, `coca-cola`, `coke`, `pepsi`, `fanta`, `sprite`, `stoney`, `appletiser`, `grapetiser`, `liqui fruit`, `ceres juice`, `fruitree`, `red bull`, `monster energy`, `powerade`, `lancewood`, `stork`, `sunfoil`, `excella`, `mrs balls`, `knorr`, `royco`, `aromat`, `robertsons`, `maggi`, `huletts`, `selati`, `snowflake`, `golden cloud`, `willards`, `yum yum`, `tiger brands`, `woolies food`, `woolworths food`, `checkers sixty60`, `sixty60`, `pnp asap`
- **Weak:** `food`, `shopping`, `kos`
- **Retailers:** `woolworth`, `woolworths`, `woolies`, `checkers`, `checkers hyper`, `pick n pay`, `pick 'n pay`, `picknpay`, `pnp`, `spar`, `superspar`, `kwikspar`, `shoprite`, `usave`, `boxer`, `food lover's`, `food lovers`, `food lover`, `fruit & veg`, `fruit and veg`, `fruit & veg city`, `ok foods`, `ok grocer`, `makro`, `cambridge`, `president hyper`, `food store`, `choppies`, `game food`

### 🍝 Eating out — `eatingout`

#### Takeaway / delivery — `eatingout_takeaway`

- **Brands:** `uber eats`, `ubereats`, `mr d`, `mr d food`, `mr delivery`, `mrd`, `bolt food`, `kfc`, `nandos`, `nando's`, `steers`, `debonairs`, `roman's pizza`, `romans pizza`, `chicken licken`, `mcdonalds`, `mcdonald's`, `macdonalds`, `burger king`, `wimpy`, `fishaways`, `king pie`, `pedros`, `galitos`, `barcelos`, `hungry lion`, `pizza hut`, `dominos`, `domino's`, `simply asia`, `anat`, `subway`, `pizza perfect`, `mochachos`, `chesa nyama`, `shisanyama`, `shisa nyama`
- **Keywords:** `takeaway`, `takeaways`, `take-away`, `take away`, `takeout`, `fast food`, `food delivery`, `pizza delivery`, `drive thru`, `drive through`, `bunny chow`, `kota`, `gatsby`, `fish and chips`, `fish & chips`, `shawarma`, `shwarma`, `hot dog`, `hot dogs`
- **Weak:** `pie`, `pies`, `delivery`

#### Coffee & café — `eatingout_coffee`

- **Brands:** `vida`, `vida e caffe`, `seattle coffee`, `starbucks`, `bootlegger`, `mugg and bean`, `mugg & bean`, `mugg n bean`, `wild bean`, `wild bean cafe`, `motherland coffee`, `father coffee`, `truth coffee`, `origin coffee`, `tribe coffee`, `house of coffees`
- **Keywords:** `cafe`, `coffee shop`, `coffee out`, `coffee date`, `coffee with`, `cappuccino`, `latte`, `flat white`, `americano`, `espresso`, `macchiato`, `cortado`, `babyccino`, `chai latte`, `mochaccino`, `iced coffee`, `hot chocolate`, `coffee and cake`, `high tea`

#### Bars & drinks — `eatingout_drinks`

- **Keywords:** `pub`, `tavern`, `shebeen`, `cocktail`, `cocktails`, `brewery`, `bar tab`, `round of drinks`, `drinks`, `nightclub`, `night out`, `shots`, `pint`, `pints`, `beer garden`, `wine bar`, `rooftop bar`, `happy hour`, `sundowners`
- **Weak:** `bar`, `tab`, `club`, `jol`, `lounge`

#### Restaurant — `eatingout_restaurant`

- **Brands:** `spur`, `ocean basket`, `col'cacchio`, `colcacchio`, `panarottis`, `the hussar`, `hussar grill`, `rocomamas`, `tashas`, `kauai`, `john dory's`, `john dorys`, `cappello`, `news cafe`, `primi piatti`, `turn n tender`, `turn 'n tender`, `rj's`, `black steer`, `beefcakes`, `doppio zero`, `the grillhouse`, `marble`
- **Keywords:** `restaurant`, `dinner out`, `lunch out`, `breakfast out`, `brunch out`, `date night`, `sit down meal`, `eating out`, `meal out`, `set menu`, `tasting menu`, `fine dining`, `sushi`, `sushi bar`, `pizza`, `pizzeria`, `burger`, `burgers`, `steakhouse`, `waiter`, `waiter tip`, `buffet`, `carvery`, `dim sum`, `ramen`, `tapas`, `bistro`, `trattoria`, `goulash`, `langos`, `pierogi`, `paprikash`
- **Weak:** `dinner`, `lunch`, `breakfast`, `brunch`, `tip`, `curry`, `grill`, `aandete`, `middagete`, `ontbyt`, `brekkie`, `brekky`, `brekki`

#### Eating out (other) — `eatingout`

- **Weak:** `meal`, `meals`, `food out`

### 🏠 Bills & rent — `bills`

#### Rent / bond — `rent`

- **Keywords:** `rent`, `rental`, `monthly rent`, `house rent`, `flat rent`, `room rent`, `bond`, `bond repayment`, `bond payment`, `home loan`, `mortgage`, `lease`, `landlord`, `letting agent`, `rental agent`, `boarding`, `huur`

#### Levies & rates — `rent_levies`

- **Keywords:** `levy`, `levies`, `rates and taxes`, `body corporate`, `hoa`, `homeowners association`, `sectional title`, `estate levy`, `property rates`, `municipal rates`
- **Weak:** `rates`

#### Deposit — `rent_deposit`

- **Keywords:** `deposit`, `damage deposit`, `rental deposit`, `security deposit`, `key deposit`

#### Electricity / prepaid — `utilities_electricity`

- **Brands:** `eskom`, `city power`, `centlec`
- **Keywords:** `electric`, `electricity`, `prepaid electric`, `prepaid electricity`, `electricity units`, `electricity token`, `load shedding`, `loadshedding`, `kwh`, `krag`
- **Weak:** `prepaid`, `units`

#### Water & municipal — `utilities_water`

- **Brands:** `rand water`, `joburg water`, `johannesburg water`
- **Keywords:** `water bill`, `water account`, `water and lights`, `municipal`, `municipality`, `municipal account`, `municipal bill`, `sanitation`, `refuse`, `refuse removal`, `sewer`, `sewerage`, `city of joburg`, `coj`, `city of tshwane`, `tshwane`, `ekurhuleni`, `city of cape town`, `ethekwini`
- **Weak:** `water`

#### Internet / fibre — `utilities_internet`

- **Brands:** `vumatel`, `openserve`, `webafrica`, `afrihost`, `mweb`, `cool ideas`, `frogfoot`, `octotel`, `metrofibre`, `herotel`, `starlink`, `axxess`, `vox`
- **Keywords:** `fibre`, `fiber`, `internet`, `wifi`, `wi-fi`, `adsl`, `lte`, `uncapped`, `router`, `home fibre`, `telkom fibre`, `rain fibre`, `fibre contract`

#### Mobile / airtime — `utilities_mobile`

- **Brands:** `vodacom`, `mtn`, `telkom`, `cell c`, `cellc`, `lebara`, `fnb connect`
- **Keywords:** `airtime`, `data bundle`, `data bundles`, `prepaid data`, `prepaid airtime`, `airtime top up`, `data top up`, `cellphone contract`, `phone contract`, `cell phone bill`, `cellphone bill`, `phone bill`, `sim card`, `rain mobile`, `rain 5g`
- **Weak:** `data`, `sim`, `rain`, `contract`, `recharge`

#### DSTV / TV licence — `utilities_tv`

- **Brands:** `dstv`, `multichoice`, `sabc`, `gotv`, `openview`, `starsat`
- **Keywords:** `tv licence`, `tv license`, `explora`, `satellite tv`

#### Insurance — `bills_insurance`

- **Brands:** `outsurance`, `santam`, `miway`, `king price`, `budget insurance`, `dialdirect`, `dial direct`, `hollard`, `old mutual`, `sanlam`, `liberty life`, `1life`, `clientele`, `discovery insure`, `naked insurance`, `pineapple insurance`, `auto & general`, `first for women`, `assupol`, `avbob`
- **Keywords:** `insurance`, `car insurance`, `vehicle insurance`, `home insurance`, `household insurance`, `contents insurance`, `building insurance`, `buildings insurance`, `life cover`, `life insurance`, `funeral cover`, `funeral policy`, `insurance premium`, `monthly premium`, `insurance excess`, `travel insurance`, `pet insurance`
- **Weak:** `policy`, `premium`

#### Medical aid — `bills_medical`

- **Brands:** `discovery health`, `momentum health`, `bonitas`, `medshield`, `fedhealth`, `gems medical`, `bestmed`, `medihelp`, `profmed`, `keyhealth`, `polmed`, `sizwe hosmed`
- **Keywords:** `medical aid`, `medical scheme`, `hospital plan`, `gap cover`
- **Weak:** `discovery`, `vitality`

#### Loans & credit — `bills_debt`

- **Brands:** `payjustnow`, `pay just now`, `payflex`, `mobicred`, `happy pay`
- **Keywords:** `loan`, `loan repayment`, `personal loan`, `credit card`, `credit card payment`, `store card`, `store account`, `clothing account`, `instalment`, `installment`, `edgars account`, `truworths account`, `debt repayment`, `debt review`

#### Streaming & subscriptions — `entertainment_streaming`

- **Brands:** `netflix`, `spotify`, `showmax`, `disney`, `audible`, `icloud`, `dropbox`, `patreon`, `paramount`, `britbox`, `deezer`, `tidal`, `chatgpt`, `openai`, `canva`, `duolingo`, `crunchyroll`, `mubi`, `adobe`
- **Keywords:** `apple music`, `apple tv`, `apple one`, `youtube premium`, `youtube music`, `amazon prime`, `prime video`, `google one`, `disney plus`, `hbo max`, `paramount plus`, `chatgpt plus`, `microsoft 365`, `office 365`, `kindle unlimited`, `showmax pro`, `streaming service`
- **Weak:** `subscription`, `subscriptions`, `streaming`

#### Utilities (other) — `utilities`

- **Brands:** `easigas`, `afrox`, `totalgaz`
- **Keywords:** `gas`, `lpg`, `lpg gas`, `gas refill`, `gas bottle`, `gas cylinder`, `utility`, `utilities`, `paraffin`

#### Bill (other) — `bills`

- **Weak:** `bill`, `bills`, `debit order`, `monthly bill`

### 🚗 Transport — `transport`

#### Uber / Bolt / taxi — `transport_rideshare`

- **Brands:** `uber`, `bolt`, `indriver`, `in driver`, `didi`, `yango`
- **Keywords:** `taxi`, `e-hailing`, `ehailing`, `lift club`, `uber ride`, `uber trip`
- **Weak:** `cab`, `ride`, `lift`

#### Fuel / petrol — `transport_fuel`

- **Brands:** `engen`, `shell`, `bp`, `sasol`, `totalenergies`, `total energies`, `total garage`, `total petrol`, `caltex`, `astron`, `astron energy`, `puma energy`
- **Keywords:** `petrol`, `fuel`, `diesel`, `unleaded`, `fill up`, `fill-up`, `fuel up`, `tank of petrol`, `petrol money`, `fuel money`, `petrol contribution`, `fuel card`
- **Weak:** `garage`

#### Parking, tolls & fines — `transport_parking`

- **Brands:** `sanral`, `paycity`, `aarto`
- **Keywords:** `parking`, `parkade`, `parking ticket`, `parking fee`, `parking meter`, `airport parking`, `car guard`, `e-toll`, `etoll`, `toll`, `tolls`, `toll gate`, `toll fee`, `toll road`, `boom gate`, `traffic fine`, `speeding fine`, `speeding ticket`, `parking fine`, `valet parking`
- **Weak:** `fine`, `fines`

#### Gautrain / public — `transport_public`

- **Brands:** `gautrain`, `myciti`, `my citi`, `rea vaya`, `reavaya`, `a re yeng`, `areyeng`, `go george`, `metrobus`, `putco`, `golden arrow`, `intercape`, `translux`, `citiliner`, `metrorail`, `prasa`, `shosholoza meyl`
- **Keywords:** `bus`, `buses`, `bus fare`, `bus ticket`, `train`, `train ticket`, `shuttle`, `airport shuttle`, `airport transfer`, `minibus`, `minibus taxi`, `kombi`, `taxi fare`, `taxi rank`, `ferry`, `gautrain card`, `intercity bus`, `coach ticket`

#### Car service & upkeep — `transport_car`

- **Brands:** `midas`, `autozone`, `goldwagen`, `tiger wheel`, `supa quick`, `supaquick`, `hi-q`, `bridgestone`, `dunlop`, `pg glass`, `glasfit`, `cartrack`, `netstar`
- **Keywords:** `car service`, `car wash`, `carwash`, `tyre`, `tyres`, `tire`, `tires`, `licence disc`, `license disc`, `car licence`, `vehicle licence`, `mechanic`, `panelbeat`, `panelbeater`, `panel beater`, `car battery`, `engine oil`, `oil change`, `wheel alignment`, `wheel balancing`, `roadworthy`, `brake pads`, `brakes`, `windscreen`, `car parts`, `auto parts`, `spare parts`, `car repair`, `car maintenance`, `service plan`, `aa membership`, `automobile association`, `vehicle tracker`, `car tracker`

#### Transport (other) — `transport`

- **Keywords:** `car`, `car payment`, `car instalment`, `vehicle finance`, `car finance`
- **Weak:** `vehicle`, `commute`, `transport`

### 🧴 Household — `household`

#### Cleaning & domestic help — `household_cleaning`

- **Brands:** `sweepsouth`, `sweep south`
- **Keywords:** `domestic`, `domestic worker`, `domestic helper`, `domestic wages`, `maid`, `housekeeper`, `cleaner`, `cleaners`, `cleaning lady`, `cleaning service`, `deep clean`, `house cleaning`, `laundry service`, `laundromat`, `dry cleaning`, `dry cleaner`, `dry cleaners`, `ironing`, `gardener`, `gardener wages`
- **Weak:** `helper`, `char`, `laundry`

#### Security & armed response — `household_security`

- **Brands:** `adt`, `fidelity adt`, `fidelity`, `chubb`, `beagle watch`, `6th sense`, `protea coin`, `g4s`, `blue security`
- **Keywords:** `security`, `armed response`, `security company`, `security guard`, `night guard`, `alarm`, `alarm system`, `alarm monitoring`, `beams`, `cctv`, `security camera`, `electric fence`, `electric fencing`, `panic button`, `access control`, `estate security`, `neighbourhood watch`, `community patrol`
- **Weak:** `guard`

#### Maintenance & hardware — `household_maintenance`

- **Brands:** `builders`, `builders warehouse`, `builders express`, `leroy merlin`, `cashbuild`, `buco`, `brights`, `chamberlain`, `chamberlains`, `mica`, `timbercity`, `build it`, `pennypinchers`, `penny pinchers`, `plumblink`, `brico`, `bricomart`, `plascon`, `dulux`
- **Keywords:** `hardware`, `hardware store`, `plumber`, `plumbing`, `electrician`, `handyman`, `tools`, `toolbox`, `drill`, `repairs`, `geyser`, `paint`, `painter`, `light bulb`, `light bulbs`, `globes`, `extension cord`, `leaking tap`, `tap washer`, `pipes`, `blocked drain`, `roofing`, `roof repair`, `gutter`, `gutters`, `tiles`, `tiling`, `grout`, `cement`, `bricks`, `timber`, `screws`, `screws and nails`, `bolts`, `nuts and bolts`, `silicone`, `sealant`, `locksmith`, `key cutting`, `gate remote`, `garage door`, `gate motor`, `gate repair`, `pest control`, `fumigation`, `borehole`, `pool maintenance`, `pool chemicals`, `pool pump`, `pool cleaning`, `chlorine`, `solar panel`, `solar panels`, `inverter`, `battery backup`, `backup battery`, `generator`, `jojo tank`, `water tank`, `aircon`, `air conditioner`, `damp proofing`, `waterproofing`, `renovation`, `renovations`, `contractor`, `multi plug`, `extension lead`, `plug adapter`, `key copy`, `key copies`, `spare key`, `duplicate key`, `super glue`
- **Weak:** `maintenance`, `repair`, `globe`, `lock`, `builder`, `pool`, `toilet`, `remote`, `keys`

#### Furniture, décor & appliances — `household_furniture`

- **Brands:** `coricraft`, `mr price home`, `mrp home`, `@home`, `sheet street`, `wetherlys`, `furniture city`, `dial-a-bed`, `house & home`, `homechoice`, `home choice`, `ikea`, `loads of living`, `weylandts`, `block & chisel`, `boardmans`, `yuppiechef`, `hirsch's`, `defy`, `russell hobbs`, `kenwood`, `smeg`, `salton`, `sunbeam`, `morphy richards`, `tefal`, `le creuset`
- **Keywords:** `furniture`, `couch`, `sofa`, `bed`, `mattress`, `bed base`, `wardrobe`, `chest of drawers`, `dining table`, `coffee table`, `bookshelf`, `shelves`, `decor`, `linen`, `bed linen`, `towel`, `towels`, `bath towel`, `sheet set`, `duvet`, `duvet cover`, `pillow`, `pillows`, `cushion`, `cushions`, `curtains`, `blinds`, `rug`, `carpet`, `lamp`, `mirror`, `picture frame`, `vase`, `crockery`, `cutlery`, `dinner plates`, `pots and pans`, `cookware`, `frying pan`, `baking tray`, `wine glasses`, `mugs`, `storage boxes`, `tupperware`, `hangers`, `laundry basket`, `ironing board`, `kitchen utensils`, `utensils`, `homeware`, `appliance`, `appliances`, `kettle`, `toaster`, `microwave`, `fridge`, `refrigerator`, `freezer`, `washing machine`, `tumble dryer`, `dishwasher`, `stove`, `oven`, `air fryer`, `airfryer`, `blender`, `coffee machine`, `nespresso machine`, `vacuum`, `vacuum cleaner`, `heater`, `electric blanket`, `slow cooker`, `pressure cooker`, `food processor`
- **Weak:** `chair`, `chairs`, `table`, `sheets`, `iron`, `fan`, `plates`

#### Garden — `household_garden`

- **Brands:** `stodels`, `lifestyle garden`, `starke ayres`, `plantland`
- **Keywords:** `garden`, `gardening`, `garden service`, `plant`, `plants`, `nursery`, `lawn`, `lawn mower`, `lawnmower`, `lawn service`, `grass cutting`, `compost`, `seedlings`, `seeds`, `potting soil`, `fertiliser`, `fertilizer`, `mulch`, `plant pots`, `garden hose`, `weed killer`, `tree felling`, `irrigation`, `sprinkler`, `bokashi`, `compost bin`, `worm farm`
- **Weak:** `soil`, `hose`, `trees`

#### Pharmacy & toiletries — `household_pharmacy`

- **Brands:** `dis-chem`, `dischem`, `dis chem`, `medirite`, `medi rite`, `link pharmacy`, `alpha pharm`, `nivea`, `vaseline`, `colgate`, `sensodyne`, `gillette`, `huggies`, `pampers`, `garnier`, `loreal`, `l'oreal`, `maybelline`, `revlon`, `the body shop`, `protex`, `lifebuoy`, `rexona`
- **Keywords:** `pharmacy`, `chemist`, `meds`, `medication`, `medicine`, `prescription`, `cold and flu`, `vitamins`, `supplements`, `antihistamine`, `plasters`, `first aid kit`, `toiletries`, `toiletry`, `shampoo`, `conditioner`, `deodorant`, `deo`, `roll on`, `toothpaste`, `toothbrush`, `tandeborsel`, `tandepasta`, `dental floss`, `mouthwash`, `body wash`, `shower gel`, `soap`, `hand soap`, `face wash`, `moisturiser`, `moisturizer`, `body lotion`, `lotion`, `sunscreen`, `sunblock`, `lip balm`, `razor`, `razors`, `shaving cream`, `sanitary pads`, `tampons`, `panty liners`, `nappies`, `diapers`, `baby wipes`, `wet wipes`, `cotton wool`, `cotton buds`, `cosmetics`, `makeup`, `make-up`, `mascara`, `lipstick`, `skincare`, `nail polish`, `perfume`, `fragrance`, `cologne`, `hair dye`, `condoms`, `contact lens solution`, `panado`, `disprin`, `med-lemon`, `grand-pa`
- **Weak:** `wipes`, `pads`, `script`
- **Retailers:** `clicks`

#### Household (other) — `household`

- **Weak:** `supplies`, `cleaning`, `household`, `house stuff`, `home stuff`

### 🎬 Leisure — `leisure`

#### Movies & shows — `entertainment_movies`

- **Brands:** `ster-kinekor`, `ster kinekor`, `sterkinekor`, `nu metro`, `numetro`, `nu-metro`, `the bioscope`, `labia`, `artscape`, `joburg theatre`, `montecasino theatre`, `theatre on the bay`
- **Keywords:** `movie`, `movies`, `movie night`, `movie tickets`, `cinema`, `imax`, `4dx`, `drive-in`, `theatre`, `theater`, `musical`, `ballet`, `opera`, `film`, `box office`
- **Weak:** `show`, `shows`

#### Events & tickets — `entertainment_events`

- **Brands:** `computicket`, `quicket`, `webtickets`, `ticketpro`, `howler`, `ticketmaster`, `oppikoppi`, `afrikaburn`, `rocking the daisies`
- **Keywords:** `concert`, `gig`, `festival`, `music festival`, `tickets`, `events`, `expo`, `comedy show`, `comedy club`, `stand-up`, `live music`, `rugby match`, `soccer match`, `cricket match`, `match tickets`, `game tickets`, `stadium`
- **Weak:** `ticket`, `event`

#### Games — `entertainment_gaming`

- **Brands:** `steam`, `playstation`, `xbox`, `nintendo`, `epic games`, `twitch`, `bt games`, `btgames`, `raru`
- **Keywords:** `video game`, `video games`, `gaming`, `ps5`, `ps4`, `psn`, `ps plus`, `xbox live`, `game pass`, `gamepass`, `nintendo switch`, `in-game`, `in game purchase`, `battle pass`, `v-bucks`, `vbucks`, `fortnite`, `ea fc`, `call of duty`, `roblox`, `robux`, `minecraft`, `discord nitro`, `steam deck`, `console`, `gaming chair`
- **Weak:** `game`, `loot`, `controller`

#### Sport & fitness — `entertainment_sport`

- **Brands:** `virgin active`, `planet fitness`, `zone fitness`, `anytime fitness`, `sportsmans warehouse`, `sportsman's warehouse`, `totalsports`, `total sports`, `cape union mart`, `outdoor warehouse`
- **Keywords:** `gym`, `gym membership`, `crossfit`, `parkrun`, `sport`, `sports`, `padel`, `padel court`, `tennis`, `golf`, `soccer`, `football`, `rugby`, `cricket`, `netball`, `hockey`, `golf club`, `golf day`, `green fees`, `cycling`, `bicycle`, `bike service`, `running shoes`, `marathon`, `race entry`, `comrades`, `two oceans`, `cycle tour`, `yoga`, `pilates`, `swimming`, `swimming lessons`, `dance class`, `karate`, `martial arts`, `climbing`, `climbing gym`, `surfing`, `surf lessons`, `hiking`, `protein`, `protein powder`, `whey`, `creatine`, `fitness`, `personal trainer`, `pt session`
- **Weak:** `squash`, `running`, `boxing`

#### Travel & accommodation — `other_travel`

- **Brands:** `booking.com`, `bookingcom`, `airbnb`, `lekkeslaap`, `safarinow`, `travelstart`, `flight centre`, `flightcentre`, `expedia`, `sanparks`, `flysafair`, `kulula`, `safair`, `airlink`, `british airways`, `south african airways`, `emirates`, `qatar airways`, `ethiopian airlines`, `cemair`, `avis`, `hertz`, `europcar`, `bidvest car rental`, `tempest car hire`, `woodford car hire`, `sun city`
- **Keywords:** `flight`, `flights`, `air ticket`, `plane ticket`, `airline`, `hotel`, `hotel stay`, `b&b`, `bnb`, `bed and breakfast`, `lodge`, `game lodge`, `game drive`, `safari`, `kruger`, `kruger park`, `wild card`, `park fees`, `conservation fee`, `travel`, `getaway`, `weekend away`, `holiday`, `vacation`, `guesthouse`, `guest house`, `backpackers`, `hostel`, `resort`, `self catering`, `car hire`, `car rental`, `rental car`, `visa application`, `luggage`, `suitcase`, `road trip`, `holiday accommodation`, `camping`, `campsite`, `timeshare`, `cruise`
- **Weak:** `accommodation`, `airport`, `trip`, `visa`

#### Hobbies & outings — `leisure_hobbies`

- **Brands:** `exclusive books`, `bargain books`, `cna`, `two oceans aquarium`, `ushaka`, `gold reef city`, `kirstenbosch`
- **Keywords:** `hobby`, `hobbies`, `activities`, `crafts`, `art supplies`, `art class`, `pottery`, `painting class`, `sewing`, `knitting`, `books`, `bookstore`, `book shop`, `kindle`, `magazine`, `magazines`, `board game`, `chess`, `puzzle`, `lego`, `museum`, `zoo`, `aquarium`, `theme park`, `water park`, `bowling`, `putt putt`, `mini golf`, `escape room`, `go karting`, `go-karts`, `paintball`, `trampoline park`, `picnic`, `wine tasting`, `wine farm`, `brewery tour`, `botanical garden`, `botanical gardens`, `day out`, `photography`, `music lessons`, `guitar`, `piano`, `fishing`, `fishing licence`, `party supplies`
- **Weak:** `outing`, `activity`, `craft`, `book`, `gallery`, `party`, `fabric`, `wool`

#### Leisure (other) — `entertainment`

- **Weak:** `entertainment`, `leisure`, `fun`

### 💳 Other — `other`

#### Doctor & medical — `other_medical`

- **Brands:** `lancet`, `ampath`, `pathcare`, `specsavers`, `spec-savers`, `netcare`, `mediclinic`, `life healthcare`, `er24`, `medicross`, `intercare`
- **Keywords:** `doctor`, `gp`, `dentist`, `dental`, `orthodontist`, `hospital`, `hospital bill`, `clinic`, `medical`, `medical bill`, `consultation`, `specialist`, `radiology`, `x-ray`, `pathology`, `blood test`, `blood tests`, `physio`, `physiotherapy`, `physiotherapist`, `chiropractor`, `biokinetics`, `optometrist`, `optometry`, `optician`, `eye test`, `prescription glasses`, `contact lenses`, `psychologist`, `counselling`, `psychiatrist`, `dermatologist`, `gynae`, `gynaecologist`, `paediatrician`, `pediatrician`, `vaccination`, `flu shot`, `covid test`, `emergency room`, `ambulance`, `hearing aid`, `ultrasound`, `sonar`, `mri`, `teeth cleaning`
- **Weak:** `therapy`, `therapist`, `consult`, `casualty`, `glasses`

#### Bank & fees — `other_fees`

- **Keywords:** `bank fee`, `bank fees`, `bank charges`, `service fee`, `admin fee`, `monthly account fee`, `account fee`, `eft fee`, `atm fee`, `card fee`, `interest charge`, `transaction fee`, `cash withdrawal fee`, `overdraft`, `penalty fee`, `late fee`, `late payment fee`, `debit order fee`
- **Weak:** `interest`, `fnb`, `absa`, `standard bank`, `nedbank`, `capitec`, `tymebank`, `discovery bank`, `investec`, `african bank`

#### Tax, legal & admin — `other_admin`

- **Keywords:** `sars`, `tax return`, `efiling`, `income tax`, `provisional tax`, `home affairs`, `passport`, `smart id`, `id card`, `police clearance`, `notary`, `attorney`, `lawyer`, `legal fees`, `conveyancing`, `transfer duty`, `accountant`, `accounting fees`, `tax practitioner`, `affidavit`, `certified copies`, `drivers licence`, `driver's licence`, `drivers license`, `licence renewal`, `license renewal`, `learners licence`
- **Weak:** `tax`, `legal`, `admin`

#### Gifts & donations — `other_gifts`

- **Brands:** `netflorist`
- **Keywords:** `gift`, `gifts`, `gift card`, `gift voucher`, `donation`, `donate`, `charity`, `birthday present`, `birthday gift`, `wedding gift`, `baby shower`, `christmas present`, `christmas presents`, `xmas`, `anniversary gift`, `flowers`, `bouquet`, `florist`, `greeting card`, `tithe`, `offering`, `church`, `gift wrap`, `wrapping paper`, `secret santa`, `backabuddy`
- **Weak:** `present`, `presents`, `voucher`, `funeral`, `collection`, `christmas`

#### Kids & school — `other_kids`

- **Brands:** `toys r us`, `toy kingdom`, `baby city`
- **Keywords:** `school`, `school fees`, `creche`, `daycare`, `day care`, `preschool`, `pre-school`, `playschool`, `nursery school`, `aftercare`, `stationery`, `textbooks`, `text books`, `school uniform`, `uniform`, `extra lessons`, `tutor`, `tutoring`, `school trip`, `school outing`, `school shoes`, `lunchbox`, `school bag`, `school supplies`, `back to school`, `pocket money`, `babysitter`, `babysitting`, `nanny`, `au pair`, `toys`, `toy`, `pram`, `car seat`, `crayons`, `kids party`, `tuition`, `university fees`, `varsity`, `student fees`, `unisa`
- **Weak:** `kids`, `kid`, `children`, `baby`, `toddler`, `allowance`

#### Pets — `other_pets`

- **Brands:** `petworld`, `pet world`, `absolute pets`, `bravecto`, `nexgard`, `royal canin`, `hill's`, `acana`, `montego`, `bobtail`
- **Keywords:** `pet`, `pets`, `vet`, `vet bill`, `veterinary`, `veterinarian`, `dog food`, `cat food`, `pet food`, `pet mince`, `dog treats`, `cat litter`, `kitty litter`, `petshop`, `pet shop`, `pet grooming`, `dog grooming`, `groomer`, `kennel`, `kennels`, `cattery`, `dog walker`, `dog sitter`, `pet sitter`, `deworm`, `flea treatment`, `tick and flea`, `bird seed`, `fish food`, `poo bags`, `poop bags`, `kattekos`, `hondekos`, `dog`, `dogs`, `cat`, `cats`, `puppy`, `kitten`
- **Weak:** `litter`, `spca`

#### Clothing & shoes — `other_clothing`

- **Brands:** `mr price`, `mrp`, `edgars`, `jet stores`, `truworths`, `foschini`, `markham`, `sportscene`, `cotton on`, `h&m`, `zara`, `pep stores`, `pepstores`, `ackermans`, `studio 88`, `superbalist`, `shein`, `zando`, `country road`, `trenery`, `witchery`, `levi's`, `levis`, `nike`, `adidas`, `puma`, `new balance`, `asics`, `converse`, `crocs`, `skechers`, `hi-tec`, `under armour`, `the north face`, `spitz`, `aldo`, `factorie`, `relay jeans`, `jay jays`
- **Keywords:** `clothes`, `clothing`, `shoes`, `sneakers`, `takkies`, `boots`, `sandals`, `slops`, `jeans`, `trousers`, `shirt`, `shirts`, `t-shirt`, `tshirt`, `dress`, `dresses`, `skirt`, `jacket`, `hoodie`, `sweater`, `socks`, `underwear`, `bra`, `lingerie`, `pyjamas`, `pajamas`, `swimsuit`, `swimming costume`, `bikini`, `beanie`, `scarf`, `belt`, `handbag`, `wallet`, `sunglasses`, `jewellery`, `jewelry`, `earrings`, `necklace`, `tailor`, `alterations`, `woolworths clothing`, `woolies clothing`
- **Weak:** `pants`, `shorts`, `coat`, `jersey`, `trainers`, `hat`, `gloves`, `pep`

#### Hair & personal care — `other_personal`

- **Brands:** `sorbet`, `placecol`, `camelot spa`, `mangwanani`
- **Keywords:** `haircut`, `hair cut`, `barber`, `barbershop`, `hairdresser`, `salon`, `hair salon`, `nail salon`, `nails`, `gel nails`, `manicure`, `pedicure`, `mani pedi`, `lash extensions`, `lashes`, `brows`, `eyebrows`, `waxing`, `beauty salon`, `spa`, `spa day`, `massage`, `facial`, `hair colour`, `hair color`, `braids`, `braiding`, `hair treatment`, `blow dry`, `tattoo`, `piercing`, `skin clinic`, `laser hair removal`, `botox`
- **Weak:** `beauty`, `wellness`, `hair`

#### Electronics & tech — `other_tech`

- **Brands:** `incredible connection`, `hifi corp`, `hi-fi corp`, `istore`, `computer mania`, `evetech`, `wootware`, `dion wired`, `samsung`, `huawei`, `xiaomi`, `oppo`, `lenovo`, `dell`, `asus`, `acer`, `logitech`, `jbl`, `bose`, `sonos`, `fitbit`, `garmin`
- **Keywords:** `electronics`, `laptop`, `computer`, `pc parts`, `smartphone`, `iphone`, `samsung galaxy`, `ipad`, `macbook`, `airpods`, `earphones`, `headphones`, `earbuds`, `bluetooth speaker`, `charger`, `phone charger`, `usb`, `hdmi`, `power bank`, `powerbank`, `phone case`, `screen protector`, `printer`, `printer ink`, `ink cartridge`, `toner`, `monitor`, `keyboard`, `smart watch`, `smartwatch`, `apple watch`, `smart tv`, `television`, `camera`, `gopro`, `drone`, `hard drive`, `ssd`, `memory card`, `sd card`, `software`, `antivirus`, `phone repair`, `screen repair`, `laptop repair`, `apple store`, `gadget`, `gadgets`
- **Weak:** `phone`, `cellphone`, `tv`, `speaker`, `cable`, `mouse`, `pc`, `tablet`

#### Online & general shopping — `other_shopping`

- **Brands:** `postnet`, `the courier guy`, `pargo`, `aramex`, `paxi`, `pudo`, `aliexpress`, `ebay`, `gumtree`, `bob shop`, `bobshop`, `onedayonly`, `one day only`
- **Keywords:** `online shopping`, `online order`, `courier`, `postage`, `post office`, `facebook marketplace`
- **Weak:** `marketplace`, `order`, `parcel`
- **Retailers:** `takealot`, `amazon`, `temu`, `game stores`, `hyperama`

#### Other — `other`

- **Weak:** `misc`, `miscellaneous`, `sundries`, `random`

## Notes

- **Storage is free text.** `expense.category` holds the slug as-is; nothing enforces the registry at the database level.
- **Categories are stored, not recomputed.** A library change only affects expenses entered after it ships. To re-file old rows, run `npm run backfill:categories` (Phase 18 §5). It touches only fallback buckets, never a category a person picked, and logs every change so a run can be reverted.
- **Legacy slugs still resolve.** The retired `rent` / `utilities` / `entertainment` parents remain in the registry, re-parented (Bills & rent, Leisure). `other_insurance` is a pure alias of Bills → Insurance and is hidden from the picker.
- **Unknown slugs degrade gracefully.** `parentOf()` falls back to the slug's `_`-prefix if that names a parent, otherwise `other`.
- **Adding vocabulary:** put the word in the right tier of the right subcategory, then run `npm test` and `npm run gen:category-matrix`. The integrity tests fail if a word is listed twice, if a brand or keyword typed alone files anywhere other than its own subcategory, or if a golden-corpus row regresses.
