export type Currency = {
  code: string;
  name: string;
  symbol: string;
  /** Number of decimal places in the currency's minor units. */
  decimals: number;
};

/**
 * Curated list of supported currencies. Decimals follow ISO 4217 minor units
 * (0 for JPY/KRW/VND/CLP/ISK/UGX, 3 for KWD/BHD/OMR/JOD, 2 otherwise) — they
 * drive minor-unit conversion in `src/lib/money.ts`, so they must be exact.
 */
export const CURRENCIES: Currency[] = [
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", decimals: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$", decimals: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", decimals: 2 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimals: 2 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimals: 2 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", decimals: 2 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimals: 2 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", decimals: 2 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimals: 2 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", decimals: 2 },
  { code: "ISK", name: "Icelandic Króna", symbol: "kr", decimals: 0 },
  { code: "PLN", name: "Polish Złoty", symbol: "zł", decimals: 2 },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč", decimals: 2 },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft", decimals: 2 },
  { code: "RON", name: "Romanian Leu", symbol: "lei", decimals: 2 },
  { code: "BGN", name: "Bulgarian Lev", symbol: "лв", decimals: 2 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2 },
  { code: "RUB", name: "Russian Ruble", symbol: "₽", decimals: 2 },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴", decimals: 2 },
  { code: "ILS", name: "Israeli New Shekel", symbol: "₪", decimals: 2 },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", decimals: 2 },
  { code: "QAR", name: "Qatari Riyal", symbol: "﷼", decimals: 2 },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD", decimals: 3 },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BD", decimals: 3 },
  { code: "OMR", name: "Omani Rial", symbol: "﷼", decimals: 3 },
  { code: "JOD", name: "Jordanian Dinar", symbol: "JD", decimals: 3 },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", decimals: 2 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", decimals: 2 },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵", decimals: 2 },
  { code: "MAD", name: "Moroccan Dirham", symbol: "MAD", decimals: 2 },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", decimals: 2 },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh", decimals: 0 },
  { code: "ETB", name: "Ethiopian Birr", symbol: "Br", decimals: 2 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨", decimals: 2 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", decimals: 2 },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs", decimals: 2 },
  { code: "NPR", name: "Nepalese Rupee", symbol: "Rs", decimals: 2 },
  { code: "THB", name: "Thai Baht", symbol: "฿", decimals: 2 },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", decimals: 0 },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", decimals: 2 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", decimals: 2 },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", decimals: 2 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", decimals: 0 },
  { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$", decimals: 2 },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", decimals: 2 },
  { code: "ARS", name: "Argentine Peso", symbol: "AR$", decimals: 2 },
  { code: "CLP", name: "Chilean Peso", symbol: "CL$", decimals: 0 },
  { code: "COP", name: "Colombian Peso", symbol: "CO$", decimals: 2 },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/", decimals: 2 },
  { code: "UYU", name: "Uruguayan Peso", symbol: "$U", decimals: 2 },
];

export const DEFAULT_CURRENCY = "USD";

const CURRENCY_BY_CODE: Record<string, Currency> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c]),
);

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

export function isSupportedCurrency(code: string): boolean {
  return code in CURRENCY_BY_CODE;
}

/**
 * Look up a currency, throwing on an unknown code.
 *
 * Falling back to USD here would scale a 0-decimal (JPY) or 3-decimal (KWD)
 * amount with 2 decimals — an `amount_minor` off by 100x/10x with no error.
 * Codes are validated on write (`settingsSchema`), so an unknown one means bad
 * data upstream and should surface loudly rather than corrupt the maths.
 */
export function getCurrency(code: string): Currency {
  const currency = CURRENCY_BY_CODE[code];
  if (!currency) throw new Error(`Unsupported currency code: ${code}`);
  return currency;
}
