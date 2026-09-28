/**
 * English names for each supported currency's major and minor unit, for
 * writing amounts out in words (`src/lib/tools/number-words.ts`).
 *
 * Plain names — "dollar", not "US dollar" — because a cheque or an invoice
 * already says which dollar, and "one hundred Singapore dollars" is not how
 * anyone writes one. Plurals follow English usage, which is invariant for many
 * currencies (yen, rand, baht, naira).
 *
 * `minor` is left out for zero-decimal currencies (JPY, KRW, VND, CLP, ISK,
 * UGX): whatever subunit exists on paper isn't used for payments, and the
 * number of decimals in `src/lib/currencies.ts` is what decides whether a
 * minor part is written at all. For three-decimal currencies (KWD, BHD, OMR,
 * JOD) the minor unit is the thousandth — fils, baisa.
 */

export type UnitName = { one: string; many: string };
export type CurrencyWords = { major: UnitName; minor?: UnitName };

const unit = (one: string, many = one): UnitName => ({ one, many });

const dollar: CurrencyWords = { major: unit("dollar", "dollars"), minor: unit("cent", "cents") };
const rupee: CurrencyWords = { major: unit("rupee", "rupees"), minor: unit("paisa", "paise") };
const peso: CurrencyWords = { major: unit("peso", "pesos"), minor: unit("centavo", "centavos") };
const shilling: CurrencyWords = { major: unit("shilling", "shillings"), minor: unit("cent", "cents") };
const dinar: CurrencyWords = { major: unit("dinar", "dinars"), minor: unit("fils") };
const krone: CurrencyWords = { major: unit("krone", "kroner"), minor: unit("øre") };

export const CURRENCY_WORDS: Record<string, CurrencyWords> = {
  USD: dollar,
  EUR: { major: unit("euro", "euros"), minor: unit("cent", "cents") },
  GBP: { major: unit("pound", "pounds"), minor: unit("penny", "pence") },
  INR: rupee,
  JPY: { major: unit("yen") },
  CAD: dollar,
  AUD: dollar,
  SGD: dollar,
  AED: { major: unit("dirham", "dirhams"), minor: unit("fils") },
  CHF: { major: unit("franc", "francs"), minor: unit("centime", "centimes") },
  CNY: { major: unit("yuan"), minor: unit("fen") },
  BRL: { major: unit("real", "reais"), minor: unit("centavo", "centavos") },
  ZAR: { major: unit("rand"), minor: unit("cent", "cents") },
  NGN: { major: unit("naira"), minor: unit("kobo") },
  HKD: dollar,
  NZD: dollar,
  SEK: { major: unit("krona", "kronor"), minor: unit("öre") },
  NOK: krone,
  DKK: krone,
  ISK: { major: unit("króna", "krónur") },
  PLN: { major: unit("złoty"), minor: unit("grosz", "groszy") },
  CZK: { major: unit("koruna", "koruny"), minor: unit("haléř", "haléře") },
  HUF: { major: unit("forint", "forints"), minor: unit("fillér") },
  RON: { major: unit("leu", "lei"), minor: unit("ban", "bani") },
  BGN: { major: unit("lev", "leva"), minor: unit("stotinka", "stotinki") },
  TRY: { major: unit("lira"), minor: unit("kuruş") },
  RUB: { major: unit("ruble", "rubles"), minor: unit("kopek", "kopeks") },
  UAH: { major: unit("hryvnia", "hryvnias"), minor: unit("kopiyka", "kopiyky") },
  ILS: { major: unit("shekel", "shekels"), minor: unit("agora", "agorot") },
  SAR: { major: unit("riyal", "riyals"), minor: unit("halala", "halalas") },
  QAR: { major: unit("riyal", "riyals"), minor: unit("dirham", "dirhams") },
  KWD: dinar,
  BHD: dinar,
  OMR: { major: unit("rial", "rials"), minor: unit("baisa") },
  JOD: dinar,
  EGP: { major: unit("pound", "pounds"), minor: unit("piastre", "piastres") },
  KES: shilling,
  GHS: { major: unit("cedi", "cedis"), minor: unit("pesewa", "pesewas") },
  MAD: { major: unit("dirham", "dirhams"), minor: unit("centime", "centimes") },
  TZS: shilling,
  UGX: { major: unit("shilling", "shillings") },
  ETB: { major: unit("birr"), minor: unit("santim") },
  PKR: rupee,
  BDT: { major: unit("taka"), minor: unit("poisha") },
  LKR: { major: unit("rupee", "rupees"), minor: unit("cent", "cents") },
  NPR: rupee,
  THB: { major: unit("baht"), minor: unit("satang") },
  VND: { major: unit("dong") },
  IDR: { major: unit("rupiah"), minor: unit("sen") },
  MYR: { major: unit("ringgit"), minor: unit("sen") },
  PHP: peso,
  KRW: { major: unit("won") },
  TWD: dollar,
  MXN: peso,
  ARS: peso,
  CLP: { major: unit("peso", "pesos") },
  COP: peso,
  PEN: { major: unit("sol", "soles"), minor: unit("céntimo", "céntimos") },
  UYU: { major: unit("peso", "pesos"), minor: unit("centésimo", "centésimos") },
};
