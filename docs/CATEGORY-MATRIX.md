# Tally — expense → category matrix

Generated from [`settleup/src/lib/domain/category.ts`](../settleup/src/lib/domain/category.ts) — that file is the source of truth; this document is a readable snapshot of it.

**7 parent categories · 49 subcategories.** `autoCategory(description)` walks the subcategory registry **in the order below** and returns the first subcategory with a keyword hit, falling back to `other`. Order is therefore meaningful: "uber eats" matches *Takeaway / delivery* before "uber" can match *Uber / Bolt / taxi*. Every auto-assignment is overridable by hand.

Keyword matching is word-aware: keywords containing punctuation or spaces match as substrings; plain single words must match a whole token, or a token prefix when the keyword is 4+ characters (so `grocer` → “groceries”, but `car` does not match “cardigan”).

## Parents at a glance

| # | Parent | Slug | Icon | Colour token | Subcategories |
| --- | --- | --- | --- | --- | --- |
| 1 | Groceries | `groceries` | 🛒 | `var(--cat-groceries)` | 4 |
| 2 | Eating out | `eatingout` | 🍝 | `var(--cat-eatingout)` | 5 |
| 3 | Bills & rent | `bills` | 🏠 | `var(--cat-rent)` | 14 |
| 4 | Transport | `transport` | 🚗 | `var(--cat-transport)` | 6 |
| 5 | Household | `household` | 🧴 | `var(--cat-household)` | 7 |
| 6 | Leisure | `leisure` | 🎬 | `var(--cat-entertainment)` | 7 |
| 7 | Other | `other` | 💳 | `var(--cat-other)` | 6 |

## Full matrix (registry order = match priority)

| Order | Parent | Subcategory | Stored slug | Trigger keywords |
| --- | --- | --- | --- | --- |
| 1 | Bills & rent | Rent / bond | `rent` | `rent`, `bond`, `lease`, `accommodation`, `airbnb` |
| 2 | Bills & rent | Levies & rates | `rent_levies` | `levy`, `levies`, `rates`, `body corporate`, `hoa` |
| 3 | Bills & rent | Deposit | `rent_deposit` | `deposit` |
| 4 | Bills & rent | Electricity / prepaid | `utilities_electricity` | `electric`, `prepaid electric`, `prepaid`, `eskom`, `load shedding`, `loadshedding` |
| 5 | Bills & rent | Water & municipal | `utilities_water` | `water bill`, `municipal`, `rand water`, `sanitation`, `refuse`, `sewer` |
| 6 | Bills & rent | Internet / fibre | `utilities_internet` | `fibre`, `fiber`, `internet`, `wifi`, `wi-fi`, `adsl`, `vumatel`, `webafrica`, `afrihost`, `cool ideas` |
| 7 | Bills & rent | Mobile / airtime | `utilities_mobile` | `airtime`, `data bundle`, `vodacom`, `mtn`, `telkom`, `cell c`, `rain ` |
| 8 | Bills & rent | DSTV / TV licence | `utilities_tv` | `dstv`, `tv licence`, `tv license`, `multichoice` |
| 9 | Bills & rent | Insurance | `bills_insurance` | `insurance`, `outsurance`, `santam`, `miway`, `king price`, `premium` |
| 10 | Bills & rent | Medical aid | `bills_medical` | `medical aid`, `discovery health`, `momentum health`, `bonitas`, `medshield` |
| 11 | Bills & rent | Streaming & subscriptions | `entertainment_streaming` | `netflix`, `spotify`, `showmax`, `disney`, `apple music`, `youtube premium`, `amazon prime`, `subscription` |
| 12 | Bills & rent | Utilities (other) | `utilities` | `gas`, `utility` |
| 13 | Bills & rent | Bill (other) | `bills` | _(none — manual / fallback bucket)_ |
| 14 | Eating out | Takeaway / delivery | `eatingout_takeaway` | `uber eats`, `mr d`, `mrd`, `takeaway`, `take-away`, `delivery`, `kfc`, `nandos`, `nando's`, `steers`, `debonairs`, `roman's`, `romans pizza`, `mcdonald`, `burger king` |
| 15 | Eating out | Coffee & café | `eatingout_coffee` | `cafe`, `café`, `coffee shop`, `vida`, `seattle coffee`, `starbucks`, `bootlegger` |
| 16 | Eating out | Bars & drinks | `eatingout_drinks` | `bar `, ` drinks`, `pub`, `cocktail`, `brewery` |
| 17 | Eating out | Restaurant | `eatingout_restaurant` | `restaurant`, `dinner`, `lunch out`, `breakfast out`, `sushi`, `pizza`, `burger`, `marble`, `date night`, `spur`, `ocean basket`, `mugg` |
| 18 | Eating out | Eating out (other) | `eatingout` | _(none — manual / fallback bucket)_ |
| 19 | Transport | Uber / Bolt / taxi | `transport_rideshare` | `uber`, `bolt`, `taxi`, `indriver` |
| 20 | Transport | Fuel / petrol | `transport_fuel` | `petrol`, `fuel`, `diesel`, `engen`, `shell`, `bp `, `sasol`, `total `, `caltex`, `astron` |
| 21 | Transport | Parking & tolls | `transport_parking` | `parking`, `e-toll`, `etoll`, `toll`, `sanral` |
| 22 | Transport | Gautrain / public | `transport_public` | `gautrain`, ` bus`, `myciti`, `train`, `metrorail` |
| 23 | Transport | Car service & upkeep | `transport_car` | `car service`, `tyre`, `tire`, `licence disc`, `license disc`, `mechanic`, `panelbeat`, `car battery`, `engine oil` |
| 24 | Transport | Transport (other) | `transport` | `car ` |
| 25 | Groceries | Liquor | `groceries_liquor` | `liquor`, `bottle store`, `tops `, `makro liquor`, `wine`, `beer`, `whisky`, `vodka`, `gin`, `cider`, `savanna`, `castle ` |
| 26 | Groceries | Meat & butcher | `groceries_butcher` | `butcher`, `deli`, `braai pack`, `meat market` |
| 27 | Groceries | Household consumables | `groceries_consumables` | `toilet paper`, `cleaning supplies`, `dishwash`, `washing powder`, `sunlight liquid`, `handy andy`, `cling wrap`, `foil`, `bin bags`, `refuse bags` |
| 28 | Groceries | Supermarket | `groceries` | `grocer`, `groceries`, `supermarket`, `woolworth`, `woolies`, `checkers`, `pick n pay`, `pick 'n pay`, `pnp`, `spar`, `shoprite`, `usave`, `boxer`, `food lover`, `fruit & veg`, `fruit and veg`, `ok foods`, `makro`, `cambridge`, `president hyper`, `food `, `milk`, `bread`, `eggs`, `egg `, `butter`, `margarine`, `cheese`, `cheddar`, `gouda`, `feta`, `mozzarella`, `cream cheese`, `yoghurt`, `yogurt`, `cream`, `amasi`, `maas`, `rice`, `pasta`, `spaghetti`, `macaroni`, `noodles`, `flour`, `cake flour`, `maize`, `mielie meal`, `maize meal`, `pap`, `samp`, `oats`, `cereal`, `weetbix`, `cornflakes`, `muesli`, `sugar`, `salt`, `spice`, `spices`, `cooking oil`, `olive oil`, `sunflower oil`, `vinegar`, `tomato sauce`, `ketchup`, `mayo`, `mayonnaise`, `mustard`, `chutney`, `jam`, `honey`, `peanut butter`, `marmite`, `bovril`, `stock cube`, `gravy`, `soup`, `chicken`, `beef`, `mince`, `steak`, `pork`, `lamb`, `sausage`, `boerewors`, `wors`, `bacon`, `ham`, `polony`, `viennas`, `russians`, `fish`, `hake`, `tuna`, `salmon`, `vegetables`, `veggies`, ` veg`, `fruit`, `apple`, `banana`, `orange`, `grapes`, `berries`, `strawberr`, `tomato`, `potato`, `onion`, `carrot`, `lettuce`, `spinach`, `cabbage`, `broccoli`, `cauliflower`, `cucumber`, `avocado`, ` avo`, `garlic`, `ginger`, `lemon`, `lime`, `mushroom`, `corn`, `mielies`, `beans`, `lentils`, `chickpeas`, `bakery`, `roll `, `bun `, `cake`, `muffin`, `biscuit`, `cookies`, `rusks`, `chocolate`, `sweets`, `candy`, `snacks`, `nuts`, `biltong`, `droëwors`, `drywors`, `popcorn`, `chips`, `crisps`, `ice cream`, `juice`, `cooldrink`, `cold drink`, `cooldrinks`, `soda`, `fizzy`, `coke`, `coffee`, `tea`, `rooibos`, `sparkling water`, `bottled water`, `still water`, `baking powder`, `yeast`, `vanilla`, `cocoa`, `icing sugar`, `custard`, `canned`, `tinned`, `baby food`, `formula` |
| 29 | Household | Cleaning & domestic help | `household_cleaning` | `domestic`, `helper`, `char`, `laundry`, `cleaner`, `sweepsouth` |
| 30 | Household | Security & armed response | `household_security` | `security`, `armed response`, `adt`, `fidelity adt`, `alarm`, `beams`, `cctv` |
| 31 | Household | Maintenance & hardware | `household_maintenance` | `hardware`, `builders warehouse`, `leroy merlin`, `plumber`, `electrician`, `tools`, `maintenance`, `repair`, `cashbuild` |
| 32 | Household | Furniture & décor | `household_furniture` | `furniture`, `decor`, `linen`, `towel`, `coricraft`, `mrp home`, `@home`, `sheet set` |
| 33 | Household | Garden | `household_garden` | `garden`, `plant`, `nursery`, `lawn`, `stodels`, `compost` |
| 34 | Household | Pharmacy & toiletries | `household_pharmacy` | `pharmacy`, `clicks`, `dis-chem`, `dischem`, `toiletr`, `shampoo`, `nappies`, `diapers` |
| 35 | Household | Household (other) | `household` | `supplies`, `cleaning` |
| 36 | Leisure | Movies & shows | `entertainment_movies` | `movie`, `cinema`, `ster-kinekor`, `nu metro`, ` show`, `theatre` |
| 37 | Leisure | Events & tickets | `entertainment_events` | `concert`, `ticket`, `festival`, `computicket`, `quicket`, ` event` |
| 38 | Leisure | Games | `entertainment_gaming` | `steam`, `playstation`, `xbox`, `nintendo`, `game pass` |
| 39 | Leisure | Sport & fitness | `entertainment_sport` | `gym`, `virgin active`, `planet fitness`, `parkrun`, `sport`, `padel` |
| 40 | Leisure | Travel & accommodation | `other_travel` | `flight`, `hotel`, `booking.com`, `lodge`, `travel`, `getaway` |
| 41 | Leisure | Hobbies & outings | `leisure_hobbies` | `hobby`, `outing`, `activity`, `crafts` |
| 42 | Leisure | Leisure (other) | `entertainment` | _(none — manual / fallback bucket)_ |
| 43 | Other | Doctor & medical | `other_medical` | `doctor`, `dentist`, `hospital`, `gp `, `optometr`, `physio`, `medical` |
| 44 | Other | Bank & fees | `other_fees` | `bank fee`, `bank charges`, `service fee`, `admin fee` |
| 45 | Other | Gifts & donations | `other_gifts` | `gift`, `donation`, `present`, `charity` |
| 46 | Other | Kids & school | `other_kids` | `school`, `creche`, `crèche`, `daycare`, `kids`, `stationery` |
| 47 | Other | Pets | `other_pets` | `pet `, `vet `, `dog food`, `cat food`, `petshop` |
| 48 | Bills & rent | Insurance | `other_insurance` | _(none — manual / fallback bucket)_ |
| 49 | Other | Other | `other` | _(none — manual / fallback bucket)_ |

## By parent

### 🛒 Groceries — `groceries`

- **Liquor** (`groceries_liquor`) — `liquor`, `bottle store`, `tops `, `makro liquor`, `wine`, `beer`, `whisky`, `vodka`, `gin`, `cider`, `savanna`, `castle `
- **Meat & butcher** (`groceries_butcher`) — `butcher`, `deli`, `braai pack`, `meat market`
- **Household consumables** (`groceries_consumables`) — `toilet paper`, `cleaning supplies`, `dishwash`, `washing powder`, `sunlight liquid`, `handy andy`, `cling wrap`, `foil`, `bin bags`, `refuse bags`
- **Supermarket** (`groceries`) — `grocer`, `groceries`, `supermarket`, `woolworth`, `woolies`, `checkers`, `pick n pay`, `pick 'n pay`, `pnp`, `spar`, `shoprite`, `usave`, `boxer`, `food lover`, `fruit & veg`, `fruit and veg`, `ok foods`, `makro`, `cambridge`, `president hyper`, `food `, `milk`, `bread`, `eggs`, `egg `, `butter`, `margarine`, `cheese`, `cheddar`, `gouda`, `feta`, `mozzarella`, `cream cheese`, `yoghurt`, `yogurt`, `cream`, `amasi`, `maas`, `rice`, `pasta`, `spaghetti`, `macaroni`, `noodles`, `flour`, `cake flour`, `maize`, `mielie meal`, `maize meal`, `pap`, `samp`, `oats`, `cereal`, `weetbix`, `cornflakes`, `muesli`, `sugar`, `salt`, `spice`, `spices`, `cooking oil`, `olive oil`, `sunflower oil`, `vinegar`, `tomato sauce`, `ketchup`, `mayo`, `mayonnaise`, `mustard`, `chutney`, `jam`, `honey`, `peanut butter`, `marmite`, `bovril`, `stock cube`, `gravy`, `soup`, `chicken`, `beef`, `mince`, `steak`, `pork`, `lamb`, `sausage`, `boerewors`, `wors`, `bacon`, `ham`, `polony`, `viennas`, `russians`, `fish`, `hake`, `tuna`, `salmon`, `vegetables`, `veggies`, ` veg`, `fruit`, `apple`, `banana`, `orange`, `grapes`, `berries`, `strawberr`, `tomato`, `potato`, `onion`, `carrot`, `lettuce`, `spinach`, `cabbage`, `broccoli`, `cauliflower`, `cucumber`, `avocado`, ` avo`, `garlic`, `ginger`, `lemon`, `lime`, `mushroom`, `corn`, `mielies`, `beans`, `lentils`, `chickpeas`, `bakery`, `roll `, `bun `, `cake`, `muffin`, `biscuit`, `cookies`, `rusks`, `chocolate`, `sweets`, `candy`, `snacks`, `nuts`, `biltong`, `droëwors`, `drywors`, `popcorn`, `chips`, `crisps`, `ice cream`, `juice`, `cooldrink`, `cold drink`, `cooldrinks`, `soda`, `fizzy`, `coke`, `coffee`, `tea`, `rooibos`, `sparkling water`, `bottled water`, `still water`, `baking powder`, `yeast`, `vanilla`, `cocoa`, `icing sugar`, `custard`, `canned`, `tinned`, `baby food`, `formula`

### 🍝 Eating out — `eatingout`

- **Takeaway / delivery** (`eatingout_takeaway`) — `uber eats`, `mr d`, `mrd`, `takeaway`, `take-away`, `delivery`, `kfc`, `nandos`, `nando's`, `steers`, `debonairs`, `roman's`, `romans pizza`, `mcdonald`, `burger king`
- **Coffee & café** (`eatingout_coffee`) — `cafe`, `café`, `coffee shop`, `vida`, `seattle coffee`, `starbucks`, `bootlegger`
- **Bars & drinks** (`eatingout_drinks`) — `bar `, ` drinks`, `pub`, `cocktail`, `brewery`
- **Restaurant** (`eatingout_restaurant`) — `restaurant`, `dinner`, `lunch out`, `breakfast out`, `sushi`, `pizza`, `burger`, `marble`, `date night`, `spur`, `ocean basket`, `mugg`
- **Eating out (other)** (`eatingout`) — _no keywords — chosen manually, and the landing place for legacy rows_

### 🏠 Bills & rent — `bills`

- **Rent / bond** (`rent`) — `rent`, `bond`, `lease`, `accommodation`, `airbnb`
- **Levies & rates** (`rent_levies`) — `levy`, `levies`, `rates`, `body corporate`, `hoa`
- **Deposit** (`rent_deposit`) — `deposit`
- **Electricity / prepaid** (`utilities_electricity`) — `electric`, `prepaid electric`, `prepaid`, `eskom`, `load shedding`, `loadshedding`
- **Water & municipal** (`utilities_water`) — `water bill`, `municipal`, `rand water`, `sanitation`, `refuse`, `sewer`
- **Internet / fibre** (`utilities_internet`) — `fibre`, `fiber`, `internet`, `wifi`, `wi-fi`, `adsl`, `vumatel`, `webafrica`, `afrihost`, `cool ideas`
- **Mobile / airtime** (`utilities_mobile`) — `airtime`, `data bundle`, `vodacom`, `mtn`, `telkom`, `cell c`, `rain `
- **DSTV / TV licence** (`utilities_tv`) — `dstv`, `tv licence`, `tv license`, `multichoice`
- **Insurance** (`bills_insurance`) — `insurance`, `outsurance`, `santam`, `miway`, `king price`, `premium`
- **Medical aid** (`bills_medical`) — `medical aid`, `discovery health`, `momentum health`, `bonitas`, `medshield`
- **Streaming & subscriptions** (`entertainment_streaming`) — `netflix`, `spotify`, `showmax`, `disney`, `apple music`, `youtube premium`, `amazon prime`, `subscription`
- **Utilities (other)** (`utilities`) — `gas`, `utility`
- **Bill (other)** (`bills`) — _no keywords — chosen manually, and the landing place for legacy rows_
- **Insurance** (`other_insurance`) — _no keywords — chosen manually, and the landing place for legacy rows_

### 🚗 Transport — `transport`

- **Uber / Bolt / taxi** (`transport_rideshare`) — `uber`, `bolt`, `taxi`, `indriver`
- **Fuel / petrol** (`transport_fuel`) — `petrol`, `fuel`, `diesel`, `engen`, `shell`, `bp `, `sasol`, `total `, `caltex`, `astron`
- **Parking & tolls** (`transport_parking`) — `parking`, `e-toll`, `etoll`, `toll`, `sanral`
- **Gautrain / public** (`transport_public`) — `gautrain`, ` bus`, `myciti`, `train`, `metrorail`
- **Car service & upkeep** (`transport_car`) — `car service`, `tyre`, `tire`, `licence disc`, `license disc`, `mechanic`, `panelbeat`, `car battery`, `engine oil`
- **Transport (other)** (`transport`) — `car `

### 🧴 Household — `household`

- **Cleaning & domestic help** (`household_cleaning`) — `domestic`, `helper`, `char`, `laundry`, `cleaner`, `sweepsouth`
- **Security & armed response** (`household_security`) — `security`, `armed response`, `adt`, `fidelity adt`, `alarm`, `beams`, `cctv`
- **Maintenance & hardware** (`household_maintenance`) — `hardware`, `builders warehouse`, `leroy merlin`, `plumber`, `electrician`, `tools`, `maintenance`, `repair`, `cashbuild`
- **Furniture & décor** (`household_furniture`) — `furniture`, `decor`, `linen`, `towel`, `coricraft`, `mrp home`, `@home`, `sheet set`
- **Garden** (`household_garden`) — `garden`, `plant`, `nursery`, `lawn`, `stodels`, `compost`
- **Pharmacy & toiletries** (`household_pharmacy`) — `pharmacy`, `clicks`, `dis-chem`, `dischem`, `toiletr`, `shampoo`, `nappies`, `diapers`
- **Household (other)** (`household`) — `supplies`, `cleaning`

### 🎬 Leisure — `leisure`

- **Movies & shows** (`entertainment_movies`) — `movie`, `cinema`, `ster-kinekor`, `nu metro`, ` show`, `theatre`
- **Events & tickets** (`entertainment_events`) — `concert`, `ticket`, `festival`, `computicket`, `quicket`, ` event`
- **Games** (`entertainment_gaming`) — `steam`, `playstation`, `xbox`, `nintendo`, `game pass`
- **Sport & fitness** (`entertainment_sport`) — `gym`, `virgin active`, `planet fitness`, `parkrun`, `sport`, `padel`
- **Travel & accommodation** (`other_travel`) — `flight`, `hotel`, `booking.com`, `lodge`, `travel`, `getaway`
- **Hobbies & outings** (`leisure_hobbies`) — `hobby`, `outing`, `activity`, `crafts`
- **Leisure (other)** (`entertainment`) — _no keywords — chosen manually, and the landing place for legacy rows_

### 💳 Other — `other`

- **Doctor & medical** (`other_medical`) — `doctor`, `dentist`, `hospital`, `gp `, `optometr`, `physio`, `medical`
- **Bank & fees** (`other_fees`) — `bank fee`, `bank charges`, `service fee`, `admin fee`
- **Gifts & donations** (`other_gifts`) — `gift`, `donation`, `present`, `charity`
- **Kids & school** (`other_kids`) — `school`, `creche`, `crèche`, `daycare`, `kids`, `stationery`
- **Pets** (`other_pets`) — `pet `, `vet `, `dog food`, `cat food`, `petshop`
- **Other** (`other`) — _no keywords — chosen manually, and the landing place for legacy rows_

## Notes

- **Storage is free text.** `expense.category` holds the slug as-is; nothing enforces the registry at the database level.
- **Legacy slugs still resolve.** The retired `rent` / `utilities` / `entertainment` parents remain in the registry, re-parented to their current home (Bills & rent, Leisure), so no migration was needed. `other_insurance` is likewise a legacy slug that now points at Bills & rent.
- **Unknown slugs degrade gracefully.** `parentOf()` falls back to the slug's `_`-prefix if it names a parent, otherwise `other`.
