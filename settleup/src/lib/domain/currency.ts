/**
 * Currency metadata for the per-expense currency picker (Phase 14, ADR-0018).
 *
 * This is presentation only. The ledger is always ZAR (ADR-0003/0017):
 * a foreign amount is converted once, at entry, and `amount_cents` stays
 * Rand — splits, balances, reports and exports never see a currency code.
 *
 * The list is the set of codes our rate provider actually quotes. Showing a
 * currency we can't convert would be worse than omitting it, so this file and
 * the `exchange_rate` table are meant to stay in step.
 */

export interface CurrencyMeta {
  code: string;
  name: string;
  symbol: string;
  /** Emoji flag, or "" where the currency has no single country (e.g. XDR). */
  flag: string;
}

/**
 * ISO 4217 codes are almost always the ISO 3166-1 alpha-2 country code plus a
 * currency letter, so the flag falls out of the first two characters — "ZAR"
 * → "ZA" → 🇿🇦. Regional-indicator letters sit at U+1F1E6 ("A"), hence the
 * offset from "A".
 */
function flagFrom(code: string): string {
  const cc = code.slice(0, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(
    ...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)
  );
}

/**
 * Codes whose first two letters aren't a country, or where the obvious
 * country isn't the useful one. Everything else derives its flag above.
 */
const FLAG_OVERRIDES: Record<string, string> = {
  EUR: "🇪🇺",
  XAF: "", // Central African CFA — six countries
  XOF: "", // West African CFA — eight countries
  XCD: "", // East Caribbean — eight territories
  XCG: "", // Caribbean guilder — Curaçao & Sint Maarten
  XPF: "", // CFP franc — French Pacific
  XDR: "", // IMF special drawing rights
  ANG: "🇨🇼",
  AUD: "🇦🇺",
  CHF: "🇨🇭",
  CNH: "🇨🇳",
  DKK: "🇩🇰",
  GBP: "🇬🇧",
  KID: "🇰🇮",
  TVD: "🇹🇻",
  ZWG: "🇿🇼",
  ZWL: "🇿🇼",
};

/** code → [name, symbol]. Symbols fall back to the code where none is common. */
const CURRENCIES: Record<string, [string, string]> = {
  ZAR: ["South African Rand", "R"],
  USD: ["US Dollar", "$"],
  EUR: ["Euro", "€"],
  GBP: ["British Pound", "£"],
  AED: ["UAE Dirham", "د.إ"],
  MUR: ["Mauritian Rupee", "₨"],
  NAD: ["Namibian Dollar", "N$"],
  BWP: ["Botswana Pula", "P"],
  MZN: ["Mozambican Metical", "MT"],
  SZL: ["Swazi Lilangeni", "L"],
  LSL: ["Lesotho Loti", "L"],
  ZWG: ["Zimbabwe Gold", "ZiG"],
  KES: ["Kenyan Shilling", "KSh"],
  TZS: ["Tanzanian Shilling", "TSh"],
  UGX: ["Ugandan Shilling", "USh"],
  NGN: ["Nigerian Naira", "₦"],
  GHS: ["Ghanaian Cedi", "₵"],
  EGP: ["Egyptian Pound", "E£"],
  MAD: ["Moroccan Dirham", "DH"],
  ZMW: ["Zambian Kwacha", "ZK"],
  MWK: ["Malawian Kwacha", "MK"],
  AOA: ["Angolan Kwanza", "Kz"],
  AUD: ["Australian Dollar", "A$"],
  NZD: ["New Zealand Dollar", "NZ$"],
  CAD: ["Canadian Dollar", "C$"],
  CHF: ["Swiss Franc", "CHF"],
  JPY: ["Japanese Yen", "¥"],
  CNY: ["Chinese Yuan", "¥"],
  CNH: ["Chinese Yuan (offshore)", "¥"],
  HKD: ["Hong Kong Dollar", "HK$"],
  SGD: ["Singapore Dollar", "S$"],
  THB: ["Thai Baht", "฿"],
  MYR: ["Malaysian Ringgit", "RM"],
  IDR: ["Indonesian Rupiah", "Rp"],
  PHP: ["Philippine Peso", "₱"],
  VND: ["Vietnamese Dong", "₫"],
  INR: ["Indian Rupee", "₹"],
  PKR: ["Pakistani Rupee", "₨"],
  LKR: ["Sri Lankan Rupee", "Rs"],
  BDT: ["Bangladeshi Taka", "৳"],
  NPR: ["Nepalese Rupee", "Rs"],
  KRW: ["South Korean Won", "₩"],
  TWD: ["New Taiwan Dollar", "NT$"],
  SAR: ["Saudi Riyal", "﷼"],
  QAR: ["Qatari Riyal", "﷼"],
  KWD: ["Kuwaiti Dinar", "KD"],
  BHD: ["Bahraini Dinar", "BD"],
  OMR: ["Omani Rial", "﷼"],
  JOD: ["Jordanian Dinar", "JD"],
  ILS: ["Israeli Shekel", "₪"],
  TRY: ["Turkish Lira", "₺"],
  RUB: ["Russian Ruble", "₽"],
  UAH: ["Ukrainian Hryvnia", "₴"],
  PLN: ["Polish Zloty", "zł"],
  CZK: ["Czech Koruna", "Kč"],
  HUF: ["Hungarian Forint", "Ft"],
  RON: ["Romanian Leu", "lei"],
  BGN: ["Bulgarian Lev", "лв"],
  RSD: ["Serbian Dinar", "дин"],
  HRK: ["Croatian Kuna", "kn"],
  SEK: ["Swedish Krona", "kr"],
  NOK: ["Norwegian Krone", "kr"],
  DKK: ["Danish Krone", "kr"],
  ISK: ["Icelandic Krona", "kr"],
  BRL: ["Brazilian Real", "R$"],
  ARS: ["Argentine Peso", "$"],
  CLP: ["Chilean Peso", "$"],
  COP: ["Colombian Peso", "$"],
  MXN: ["Mexican Peso", "$"],
  PEN: ["Peruvian Sol", "S/"],
  UYU: ["Uruguayan Peso", "$U"],
};

/** Human-readable metadata for a code, with sensible fallbacks. */
export function currencyMeta(code: string): CurrencyMeta {
  const upper = code.toUpperCase();
  const entry = CURRENCIES[upper];
  return {
    code: upper,
    name: entry?.[0] ?? upper,
    symbol: entry?.[1] ?? upper,
    flag: FLAG_OVERRIDES[upper] ?? flagFrom(upper),
  };
}

/**
 * Orders codes for the picker: most recently used first (in that order),
 * then everything else alphabetically by name. ZAR is pinned to the top of
 * the remainder so getting back to Rand is never a search.
 */
export function orderCurrencies(available: string[], recent: string[]): CurrencyMeta[] {
  const set = new Set(available.map((c) => c.toUpperCase()));
  const seen = new Set<string>();
  const out: CurrencyMeta[] = [];

  for (const code of recent.map((c) => c.toUpperCase())) {
    if (set.has(code) && !seen.has(code)) {
      seen.add(code);
      out.push(currencyMeta(code));
    }
  }
  if (set.has("ZAR") && !seen.has("ZAR")) {
    seen.add("ZAR");
    out.push(currencyMeta("ZAR"));
  }
  const rest = [...set]
    .filter((c) => !seen.has(c))
    .map(currencyMeta)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...out, ...rest];
}

/** Free-text match over code and name, for the picker's search box. */
export function searchCurrencies(list: CurrencyMeta[], query: string): CurrencyMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
  );
}

/** Most-recent-first, de-duplicated, capped — what we persist per user. */
export function pushRecentCurrency(recent: string[], code: string, max = 6): string[] {
  const upper = code.toUpperCase();
  return [upper, ...recent.map((c) => c.toUpperCase()).filter((c) => c !== upper)].slice(0, max);
}

/**
 * Converts a foreign amount to ZAR cents at a locked rate.
 *
 * Rounds to the nearest cent — the result becomes the expense's authoritative
 * `amount_cents`, which the split maths then divides exactly (ADR-0003), so
 * it must be a whole number of cents before any splitting happens.
 */
export function convertToZarCents(originalCents: number, rateToZar: number): number {
  if (!Number.isFinite(rateToZar) || rateToZar <= 0) {
    throw new Error("Exchange rate must be a positive number");
  }
  return Math.round(originalCents * rateToZar);
}

/** Formats an amount in its own currency, e.g. "$80,00" / "฿1 250,00". */
export function fmtCurrency(cents: number, code: string): string {
  const { symbol } = currencyMeta(code);
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${symbol}${whole},${(abs % 100).toString().padStart(2, "0")}`;
}
