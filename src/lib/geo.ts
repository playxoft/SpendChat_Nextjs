import { DEFAULT_CURRENCY, isSupportedCurrency } from "./currencies";

/**
 * Location → default currency/locale resolution. Pure functions only — the
 * request-header plumbing lives in `geo.server.ts` so this stays unit-testable
 * and importable anywhere.
 *
 * Resolution order (most to least reliable):
 *   1. Country from Cloudflare's edge geolocation (`cf-ipcountry`) — IP-based,
 *      set on every request in production.
 *   2. Region subtag of the browser's `Accept-Language` locales (e.g. `en-IN`),
 *      maximized via `Intl.Locale` so bare languages still resolve (`hi` → IN).
 *   3. `DEFAULT_CURRENCY`.
 */

export const DEFAULT_LOCALE = "en-US";

export type SettingsDefaults = {
  currency: string;
  locale: string;
};

/**
 * ISO 3166-1 alpha-2 country → ISO 4217 currency. Kept honest: each country
 * maps to the currency actually used there, even when we don't support it yet —
 * unsupported codes are clamped to `null` at lookup time, so adding a currency
 * to `CURRENCIES` automatically activates every country that uses it.
 * (LS/NA/SZ map to ZAR and BT to INR: those pegged currencies aren't supported,
 * but the mapped one is legal tender there.)
 */
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  // Americas
  US: "USD", AS: "USD", GU: "USD", MP: "USD", PR: "USD", VI: "USD", UM: "USD",
  EC: "USD", SV: "USD", PA: "USD", TC: "USD", VG: "USD", BQ: "USD", FM: "USD",
  MH: "USD", PW: "USD", TL: "USD", IO: "USD",
  CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  UY: "UYU", PY: "PYG", BO: "BOB", VE: "VES", GY: "GYD", SR: "SRD", FK: "FKP",
  GT: "GTQ", HN: "HNL", NI: "NIO", CR: "CRC", DO: "DOP", HT: "HTG", CU: "CUP",
  JM: "JMD", TT: "TTD", BB: "BBD", BS: "BSD", BZ: "BZD", BM: "BMD", KY: "KYD",
  AW: "AWG", CW: "ANG", SX: "ANG", GL: "DKK",
  AG: "XCD", AI: "XCD", DM: "XCD", GD: "XCD", KN: "XCD", LC: "XCD", MS: "XCD",
  VC: "XCD",
  GF: "EUR", GP: "EUR", MQ: "EUR", BL: "EUR", MF: "EUR", PM: "EUR",
  // Europe
  AT: "EUR", BE: "EUR", CY: "EUR", DE: "EUR", EE: "EUR", ES: "EUR", FI: "EUR",
  FR: "EUR", GR: "EUR", HR: "EUR", IE: "EUR", IT: "EUR", LT: "EUR", LU: "EUR",
  LV: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SI: "EUR", SK: "EUR", AD: "EUR",
  MC: "EUR", SM: "EUR", VA: "EUR", XK: "EUR", ME: "EUR", AX: "EUR", RE: "EUR",
  YT: "EUR",
  GB: "GBP", GG: "GBP", IM: "GBP", JE: "GBP", GI: "GIP", SH: "SHP",
  CH: "CHF", LI: "CHF", SE: "SEK", NO: "NOK", SJ: "NOK", DK: "DKK", FO: "DKK",
  IS: "ISK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", RS: "RSD",
  BA: "BAM", MK: "MKD", AL: "ALL", MD: "MDL", UA: "UAH", BY: "BYN", RU: "RUB",
  TR: "TRY", GE: "GEL", AM: "AMD", AZ: "AZN",
  // Middle East
  AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", IL: "ILS",
  PS: "ILS", JO: "JOD", LB: "LBP", SY: "SYP", IQ: "IQD", IR: "IRR", YE: "YER",
  // Asia
  IN: "INR", BT: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR", MV: "MVR",
  AF: "AFN", CN: "CNY", HK: "HKD", MO: "MOP", TW: "TWD", JP: "JPY", KR: "KRW",
  KP: "KPW", MN: "MNT", KZ: "KZT", KG: "KGS", TJ: "TJS", TM: "TMT", UZ: "UZS",
  TH: "THB", VN: "VND", ID: "IDR", MY: "MYR", SG: "SGD", PH: "PHP", MM: "MMK",
  KH: "KHR", LA: "LAK", BN: "BND",
  // Oceania
  AU: "AUD", CX: "AUD", CC: "AUD", HM: "AUD", KI: "AUD", NR: "AUD", NF: "AUD",
  TV: "AUD",
  NZ: "NZD", CK: "NZD", NU: "NZD", PN: "NZD", TK: "NZD",
  FJ: "FJD", PG: "PGK", SB: "SBD", VU: "VUV", WS: "WST", TO: "TOP",
  NC: "XPF", PF: "XPF", WF: "XPF",
  // Africa
  ZA: "ZAR", LS: "ZAR", NA: "ZAR", SZ: "ZAR",
  NG: "NGN", EG: "EGP", KE: "KES", GH: "GHS", MA: "MAD", EH: "MAD", TZ: "TZS",
  UG: "UGX", ET: "ETB", DZ: "DZD", TN: "TND", LY: "LYD", SD: "SDG", SS: "SSP",
  RW: "RWF", BI: "BIF", MW: "MWK", ZM: "ZMW", ZW: "USD", MZ: "MZN", AO: "AOA",
  CD: "CDF",
  CG: "XAF", CF: "XAF", CM: "XAF", GA: "XAF", GQ: "XAF", TD: "XAF",
  BJ: "XOF", BF: "XOF", CI: "XOF", GW: "XOF", ML: "XOF", NE: "XOF", SN: "XOF",
  TG: "XOF",
  GN: "GNF", GM: "GMD", SL: "SLE", LR: "LRD", MR: "MRU", SO: "SOS", DJ: "DJF",
  ER: "ERN", SC: "SCR", MU: "MUR", MG: "MGA", KM: "KMF", CV: "CVE", ST: "STN",
  BW: "BWP",
};

/**
 * The *supported* currency for a country, or null when the country is unknown
 * (including Cloudflare's `XX`/`T1` placeholders) or uses a currency we don't
 * support yet.
 */
export function currencyForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const code = COUNTRY_TO_CURRENCY[country.trim().toUpperCase()];
  return code && isSupportedCurrency(code) ? code : null;
}

/**
 * Locale tags from an `Accept-Language` header, highest q-weight first
 * (ties keep header order). Wildcards and malformed entries are dropped.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((e) => e.tag && e.tag !== "*")
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((e) => e.tag);
}

/**
 * The region a locale tag implies. Explicit subtags win (`en-IN` → IN);
 * bare languages are maximized to their likely region (`hi` → IN, `ja` → JP).
 */
export function regionFromLocale(tag: string): string | null {
  try {
    const locale = new Intl.Locale(tag);
    return locale.region ?? locale.maximize().region ?? null;
  } catch {
    return null;
  }
}

/** A well-formed BCP 47 tag suitable for `user_settings.locale`, or null. */
function normalizeLocale(tag: string): string | null {
  try {
    const baseName = new Intl.Locale(tag).baseName;
    // Schema caps locale at 20 chars; anything longer is noise anyway.
    return baseName.length <= 20 ? baseName : null;
  } catch {
    return null;
  }
}

/**
 * Default currency + locale for a first sign-in, from whatever request
 * evidence is available. Every input is optional; the result is always a
 * supported currency and a valid locale.
 */
export function resolveSettingsDefaults(input: {
  country?: string | null;
  acceptLanguage?: string | null;
}): SettingsDefaults {
  const tags = parseAcceptLanguage(input.acceptLanguage);

  let currency = currencyForCountry(input.country);
  if (!currency) {
    for (const tag of tags) {
      currency = currencyForCountry(regionFromLocale(tag));
      if (currency) break;
    }
  }

  let locale: string | null = null;
  for (const tag of tags) {
    locale = normalizeLocale(tag);
    if (locale) break;
  }

  return {
    currency: currency ?? DEFAULT_CURRENCY,
    locale: locale ?? DEFAULT_LOCALE,
  };
}
