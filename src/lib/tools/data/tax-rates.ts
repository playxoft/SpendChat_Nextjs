/**
 * VAT / GST / sales-tax rates for `/tools/vat-calculator`.
 *
 * Only countries whose current rates were checked against a reputable source
 * on `TAX_RATES_VERIFIED_ON` are listed — a country we couldn't verify is left
 * out rather than guessed, since a wrong preset is worse than typing a rate.
 * Rates change often (India's GST 2.0 in Sept 2025; Estonia, Finland, Romania,
 * Slovakia, Russia and Kazakhstan in 2024–26), so re-verify every quarter and
 * bump the date when you do.
 */

export const TAX_RATES_VERIFIED_ON = "2026-09-28";

export const TAX_RATES_SOURCE =
  "the European Commission's Taxes in Europe Database, national tax authorities and PwC Worldwide Tax Summaries";

/** The name a country's shoppers know the tax by, used in the calculator's labels. */
export type TaxName = "VAT" | "GST" | "SST" | "sales tax" | "consumption tax";

export type CountryTaxRate = {
  /** ISO 3166-1 alpha-2. */
  country: string;
  name: string;
  taxName: TaxName;
  /** The rate most goods and services carry, in percent. `null` where there's no national rate (US). */
  standard: number | null;
  /**
   * Lower rates in force (food, books, transport…), highest first. 0 only
   * where zero-rating is a mainstream domestic rate, like UK food.
   */
  reduced: number[];
  /** Rates above the standard — India's 40% slab for luxury and "sin" goods. */
  higher?: number[];
  /** Shown under the rate when the preset alone would mislead. */
  note?: string;
};

const RATES: CountryTaxRate[] = [
  // European Union (mainland rates; islands and overseas regions differ)
  { country: "AT", name: "Austria", taxName: "VAT", standard: 20, reduced: [13, 10, 4.9] },
  { country: "BE", name: "Belgium", taxName: "VAT", standard: 21, reduced: [12, 6] },
  { country: "BG", name: "Bulgaria", taxName: "VAT", standard: 20, reduced: [9] },
  { country: "HR", name: "Croatia", taxName: "VAT", standard: 25, reduced: [13, 5] },
  { country: "CY", name: "Cyprus", taxName: "VAT", standard: 19, reduced: [9, 5, 3] },
  { country: "CZ", name: "Czechia", taxName: "VAT", standard: 21, reduced: [12] },
  { country: "DK", name: "Denmark", taxName: "VAT", standard: 25, reduced: [] },
  { country: "EE", name: "Estonia", taxName: "VAT", standard: 24, reduced: [13, 9] },
  { country: "FI", name: "Finland", taxName: "VAT", standard: 25.5, reduced: [13.5, 10] },
  { country: "FR", name: "France", taxName: "VAT", standard: 20, reduced: [10, 5.5, 2.1] },
  {
    country: "DE",
    name: "Germany",
    taxName: "VAT",
    standard: 19,
    reduced: [7],
    note: "7% covers most food — including restaurant meals since 2026, though not drinks — plus books and public transport.",
  },
  { country: "GR", name: "Greece", taxName: "VAT", standard: 24, reduced: [13, 6] },
  { country: "HU", name: "Hungary", taxName: "VAT", standard: 27, reduced: [18, 5] },
  {
    country: "IE",
    name: "Ireland",
    taxName: "VAT",
    standard: 23,
    reduced: [13.5, 9, 4.8, 0],
    note: "Restaurant meals and hairdressing moved to 9% on 1 July 2026. Most food, children's clothes and books are 0%.",
  },
  { country: "IT", name: "Italy", taxName: "VAT", standard: 22, reduced: [10, 5, 4] },
  { country: "LV", name: "Latvia", taxName: "VAT", standard: 21, reduced: [12, 5] },
  { country: "LT", name: "Lithuania", taxName: "VAT", standard: 21, reduced: [12, 5] },
  { country: "LU", name: "Luxembourg", taxName: "VAT", standard: 17, reduced: [14, 8, 3] },
  { country: "MT", name: "Malta", taxName: "VAT", standard: 18, reduced: [12, 7, 5] },
  { country: "NL", name: "Netherlands", taxName: "VAT", standard: 21, reduced: [9] },
  { country: "PL", name: "Poland", taxName: "VAT", standard: 23, reduced: [8, 5] },
  { country: "PT", name: "Portugal", taxName: "VAT", standard: 23, reduced: [13, 6] },
  { country: "RO", name: "Romania", taxName: "VAT", standard: 21, reduced: [11] },
  { country: "SK", name: "Slovakia", taxName: "VAT", standard: 23, reduced: [19, 5] },
  { country: "SI", name: "Slovenia", taxName: "VAT", standard: 22, reduced: [9.5, 5] },
  { country: "ES", name: "Spain", taxName: "VAT", standard: 21, reduced: [10, 4] },
  {
    country: "SE",
    name: "Sweden",
    taxName: "VAT",
    standard: 25,
    reduced: [12, 6],
    note: "Food is 6% from 1 April 2026 to the end of 2027; restaurant meals stay at 12%.",
  },

  // Europe outside the EU
  { country: "GB", name: "United Kingdom", taxName: "VAT", standard: 20, reduced: [5, 0] },
  {
    country: "CH",
    name: "Switzerland",
    taxName: "VAT",
    standard: 8.1,
    reduced: [3.8, 2.6],
    note: "3.8% is for accommodation; 2.6% covers food, books and medicines.",
  },
  { country: "NO", name: "Norway", taxName: "VAT", standard: 25, reduced: [15, 12] },
  { country: "IS", name: "Iceland", taxName: "VAT", standard: 24, reduced: [11] },
  { country: "TR", name: "Turkey", taxName: "VAT", standard: 20, reduced: [10, 1] },
  { country: "RU", name: "Russia", taxName: "VAT", standard: 22, reduced: [10] },
  { country: "UA", name: "Ukraine", taxName: "VAT", standard: 20, reduced: [14, 7] },
  { country: "RS", name: "Serbia", taxName: "VAT", standard: 20, reduced: [10] },
  { country: "KZ", name: "Kazakhstan", taxName: "VAT", standard: 16, reduced: [10, 5] },

  // Middle East
  { country: "AE", name: "United Arab Emirates", taxName: "VAT", standard: 5, reduced: [] },
  { country: "SA", name: "Saudi Arabia", taxName: "VAT", standard: 15, reduced: [] },
  { country: "BH", name: "Bahrain", taxName: "VAT", standard: 10, reduced: [] },
  { country: "OM", name: "Oman", taxName: "VAT", standard: 5, reduced: [] },
  { country: "IL", name: "Israel", taxName: "VAT", standard: 18, reduced: [] },
  { country: "JO", name: "Jordan", taxName: "GST", standard: 16, reduced: [] },

  // Africa
  { country: "ZA", name: "South Africa", taxName: "VAT", standard: 15, reduced: [0] },
  { country: "NG", name: "Nigeria", taxName: "VAT", standard: 7.5, reduced: [0] },
  { country: "KE", name: "Kenya", taxName: "VAT", standard: 16, reduced: [] },
  { country: "EG", name: "Egypt", taxName: "VAT", standard: 14, reduced: [5] },
  { country: "MA", name: "Morocco", taxName: "VAT", standard: 20, reduced: [10] },
  {
    country: "GH",
    name: "Ghana",
    taxName: "VAT",
    standard: 20,
    reduced: [],
    note: "15% VAT plus the 2.5% NHIL and 2.5% GETFund levies, all charged on the same price.",
  },
  { country: "TZ", name: "Tanzania", taxName: "VAT", standard: 18, reduced: [] },
  { country: "UG", name: "Uganda", taxName: "VAT", standard: 18, reduced: [] },
  { country: "ET", name: "Ethiopia", taxName: "VAT", standard: 15, reduced: [] },

  // Asia-Pacific
  {
    country: "IN",
    name: "India",
    taxName: "GST",
    standard: 18,
    reduced: [5, 3, 0],
    higher: [40],
    note: "Since 22 September 2025 most goods and services are 5% or 18%; 40% is for luxury and sin goods, 3% for gold and silver.",
  },
  { country: "AU", name: "Australia", taxName: "GST", standard: 10, reduced: [] },
  { country: "NZ", name: "New Zealand", taxName: "GST", standard: 15, reduced: [] },
  {
    country: "JP",
    name: "Japan",
    taxName: "consumption tax",
    standard: 10,
    reduced: [8],
    note: "8% covers food and drink bought to take away (not alcohol) and newspapers; eating in is 10%.",
  },
  { country: "KR", name: "South Korea", taxName: "VAT", standard: 10, reduced: [] },
  { country: "CN", name: "China", taxName: "VAT", standard: 13, reduced: [9, 6] },
  { country: "SG", name: "Singapore", taxName: "GST", standard: 9, reduced: [] },
  {
    country: "MY",
    name: "Malaysia",
    taxName: "SST",
    standard: 10,
    reduced: [8, 6, 5],
    note: "SST is two taxes: sales tax on goods (10%, or 5% for some) and service tax on services (8%, or 6% for food and drink, telecoms and a few others).",
  },
  {
    country: "TH",
    name: "Thailand",
    taxName: "VAT",
    standard: 7,
    reduced: [],
    note: "The 10% statutory rate is cut to 7% by decree, currently until 30 September 2027.",
  },
  {
    country: "VN",
    name: "Vietnam",
    taxName: "VAT",
    standard: 10,
    reduced: [8, 5],
    note: "Until 31 December 2026, most goods and services normally taxed at 10% are taxed at 8%.",
  },
  {
    country: "ID",
    name: "Indonesia",
    taxName: "VAT",
    standard: 11,
    reduced: [],
    higher: [12],
    note: "The statutory rate is 12%, but most goods are taxed on 11/12 of the price — 11% in effect. Luxury goods pay the full 12%.",
  },
  { country: "PH", name: "Philippines", taxName: "VAT", standard: 12, reduced: [] },
  {
    country: "PK",
    name: "Pakistan",
    taxName: "sales tax",
    standard: 18,
    reduced: [],
    note: "18% is the federal sales tax on goods; provinces tax services separately, mostly at 15–16%.",
  },
  { country: "BD", name: "Bangladesh", taxName: "VAT", standard: 15, reduced: [10, 7.5, 5] },
  { country: "LK", name: "Sri Lanka", taxName: "VAT", standard: 18, reduced: [] },
  { country: "NP", name: "Nepal", taxName: "VAT", standard: 13, reduced: [] },
  { country: "TW", name: "Taiwan", taxName: "VAT", standard: 5, reduced: [] },

  // Americas
  {
    country: "US",
    name: "United States",
    taxName: "sales tax",
    standard: null,
    reduced: [],
    note: "There's no national sales tax. Enter your state and local rates added together — your receipt or your state's tax website shows the combined rate.",
  },
  {
    country: "CA",
    name: "Canada",
    taxName: "GST",
    standard: 5,
    reduced: [],
    higher: [15, 14, 13],
    note: "5% GST is federal. Ontario charges 13% HST, Nova Scotia 14%, and New Brunswick, Newfoundland and Labrador and PEI 15%. Quebec, BC, Manitoba and Saskatchewan add their own provincial tax to the 5%.",
  },
  {
    country: "MX",
    name: "Mexico",
    taxName: "VAT",
    standard: 16,
    reduced: [8, 0],
    note: "8% applies in the northern and southern border regions, under a decree renewed each year (currently to 31 December 2026).",
  },
  { country: "AR", name: "Argentina", taxName: "VAT", standard: 21, reduced: [10.5], higher: [27] },
  { country: "CL", name: "Chile", taxName: "VAT", standard: 19, reduced: [] },
  { country: "CO", name: "Colombia", taxName: "VAT", standard: 19, reduced: [5] },
  {
    country: "PE",
    name: "Peru",
    taxName: "VAT",
    standard: 18,
    reduced: [10.5],
    note: "18% is IGV plus the municipal tax (IPM). 10.5% is for small restaurants and hotels in 2026.",
  },
];

/** Alphabetical by name — the order of the country picker and the rates table. */
export const TAX_RATES: readonly CountryTaxRate[] = RATES.sort((a, b) => a.name.localeCompare(b.name, "en"));

const BY_CODE = new Map(TAX_RATES.map((r) => [r.country, r]));

/** The rates for a country code (any case), or null when it isn't listed. */
export function findTaxRate(country: string | null | undefined): CountryTaxRate | null {
  if (!country) return null;
  return BY_CODE.get(country.trim().toUpperCase()) ?? null;
}
