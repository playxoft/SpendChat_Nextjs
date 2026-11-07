import { describe, it, expect } from "vitest";
import {
  countryForCurrency,
  countryOptions,
  isKnownCountry,
  localeForCountry,
  COUNTRY_TO_CURRENCY,
  currencyForCountry,
  edgeCountry,
  parseAcceptLanguage,
  regionFromLocale,
  resolveSettingsDefaults,
  DEFAULT_LOCALE,
} from "@/lib/geo";
import { DEFAULT_CURRENCY, isSupportedCurrency } from "@/lib/currencies";

describe("edgeCountry", () => {
  it("reads Cloudflare's country, treating its unknown and Tor codes as none", () => {
    expect(edgeCountry("IN")).toBe("IN");
    expect(edgeCountry(" us ")).toBe("US");
    expect(edgeCountry("XX")).toBeNull();
    expect(edgeCountry("T1")).toBeNull();
    expect(edgeCountry("")).toBeNull();
    expect(edgeCountry(null)).toBeNull();
  });
});

describe("COUNTRY_TO_CURRENCY", () => {
  it("is well-formed (alpha-2 keys, alpha-3 currency values)", () => {
    for (const [country, currency] of Object.entries(COUNTRY_TO_CURRENCY)) {
      expect(country).toMatch(/^[A-Z]{2}$/);
      expect(currency).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("covers the major markets with supported currencies", () => {
    for (const country of ["US", "IN", "GB", "DE", "JP", "AU", "CA", "AE", "SG", "BR"]) {
      expect(isSupportedCurrency(COUNTRY_TO_CURRENCY[country])).toBe(true);
    }
  });
});

describe("currencyForCountry", () => {
  it("maps a country to its currency", () => {
    expect(currencyForCountry("IN")).toBe("INR");
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("FR")).toBe("EUR");
  });

  it("is case/whitespace tolerant", () => {
    expect(currencyForCountry(" in ")).toBe("INR");
    expect(currencyForCountry("gb")).toBe("GBP");
  });

  it("returns null for unknown countries and Cloudflare placeholders", () => {
    expect(currencyForCountry(null)).toBeNull();
    expect(currencyForCountry(undefined)).toBeNull();
    expect(currencyForCountry("")).toBeNull();
    expect(currencyForCountry("XX")).toBeNull();
    expect(currencyForCountry("T1")).toBeNull();
  });

  it("returns null when the country's currency isn't supported yet", () => {
    // Paraguay uses PYG, which isn't in the curated CURRENCIES list.
    expect(currencyForCountry("PY")).toBeNull();
  });
});

describe("parseAcceptLanguage", () => {
  it("returns [] for a missing header", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
  });

  it("orders tags by q-weight, keeping header order for ties", () => {
    expect(parseAcceptLanguage("en-GB,en;q=0.9,hi;q=0.8")).toEqual([
      "en-GB",
      "en",
      "hi",
    ]);
    expect(parseAcceptLanguage("fr;q=0.5, de-DE;q=0.9, es")).toEqual([
      "es",
      "de-DE",
      "fr",
    ]);
  });

  it("drops wildcards and empty entries, tolerates malformed q", () => {
    expect(parseAcceptLanguage("*,en;q=oops,,ta-IN;q=0.7")).toEqual(["ta-IN", "en"]);
  });
});

describe("regionFromLocale", () => {
  it("uses the explicit region subtag", () => {
    expect(regionFromLocale("en-IN")).toBe("IN");
    expect(regionFromLocale("pt-BR")).toBe("BR");
  });

  it("maximizes bare languages to their likely region", () => {
    expect(regionFromLocale("hi")).toBe("IN");
    expect(regionFromLocale("ja")).toBe("JP");
  });

  it("returns null for malformed tags", () => {
    expect(regionFromLocale("!!!")).toBeNull();
    expect(regionFromLocale("")).toBeNull();
  });
});

describe("resolveSettingsDefaults", () => {
  it("prefers the edge-detected country over Accept-Language", () => {
    expect(
      resolveSettingsDefaults({ country: "IN", acceptLanguage: "en-US,en;q=0.9" }),
    ).toEqual({ currency: "INR", locale: "en-US" });
  });

  it("falls back to the Accept-Language region when the country is unknown", () => {
    expect(
      resolveSettingsDefaults({ country: "XX", acceptLanguage: "en-IN,en;q=0.8" }),
    ).toEqual({ currency: "INR", locale: "en-IN" });
  });

  it("skips tags without a resolvable/supported region", () => {
    // Paraguay's PYG is unsupported; the next tag's region (JP) wins.
    expect(
      resolveSettingsDefaults({ acceptLanguage: "es-PY,ja-JP;q=0.5" }).currency,
    ).toBe("JPY");
  });

  it("resolves bare-language headers via locale maximization", () => {
    expect(resolveSettingsDefaults({ acceptLanguage: "hi" }).currency).toBe("INR");
  });

  it("returns global defaults with no evidence at all", () => {
    expect(resolveSettingsDefaults({})).toEqual({
      currency: DEFAULT_CURRENCY,
      locale: DEFAULT_LOCALE,
    });
  });

  it("skips malformed locale tags when picking the settings locale", () => {
    const res = resolveSettingsDefaults({ country: "US", acceptLanguage: "!!!,fr-FR;q=0.4" });
    expect(res).toEqual({ currency: "USD", locale: "fr-FR" });
  });

  it("never emits a locale longer than the schema cap", () => {
    const res = resolveSettingsDefaults({
      acceptLanguage: "sl-Latn-IT-rozaj-biske-1994,en-GB;q=0.5",
    });
    expect(res.locale.length).toBeLessThanOrEqual(20);
  });
});

describe("the onboarding country picker", () => {
  it("offers every country with a supported currency, by name, each once", () => {
    const list = countryOptions();
    const codes = list.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(list.find((c) => c.code === "IN")).toEqual({ code: "IN", name: "India", currency: "INR" });
    expect(list.every((c) => isSupportedCurrency(c.currency))).toBe(true);
    const names = list.map((c) => c.name);
    expect([...names].sort((a, b) => a.localeCompare(b, "en"))).toEqual(names);
  });

  it("knows only listed, upper-case country codes", () => {
    expect(isKnownCountry("IN")).toBe(true);
    expect(isKnownCountry("in")).toBe(false);
    expect(isKnownCountry("ZZ")).toBe(false);
    expect(isKnownCountry(42)).toBe(false);
  });

  it("guesses a currency's home country when location is unknown", () => {
    expect(countryForCurrency("USD")).toBe("US");
    expect(countryForCurrency("EUR")).toBe("DE");
    expect(countryForCurrency("INR")).toBe("IN");
    expect(countryForCurrency("JPY")).toBe("JP");
    expect(countryForCurrency("XXX")).toBeNull();
  });

  it("moves the number format to the chosen country, keeping the language", () => {
    expect(localeForCountry("IN", "en-GB")).toBe("en-IN");
    expect(localeForCountry("IN", "en-IN")).toBe("en-IN");
    expect(localeForCountry("DE", "de-DE")).toBe("de-DE");
    expect(localeForCountry("US", "en")).toBe("en-US");
    expect(localeForCountry("IN", "not a locale!")).toBe("not a locale!");
  });
});
