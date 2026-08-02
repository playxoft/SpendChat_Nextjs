import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_LANGUAGES,
  MAX_VOICE_LANGUAGES,
  VOICE_LANGUAGES,
  describeVoiceLanguages,
  getVoiceLanguage,
  normalizeVoiceLanguages,
  primaryBcp47,
} from "@/lib/voice-languages";

describe("VOICE_LANGUAGES — the catalogue", () => {
  it("has unique codes and a complete entry for each", () => {
    const codes = VOICE_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const lang of VOICE_LANGUAGES) {
      expect(lang.code).toMatch(/^[a-z]{2}$/);
      expect(lang.englishName.length).toBeGreaterThan(0);
      expect(lang.nativeName.length).toBeGreaterThan(0);
      // A BCP-47 tag with a region — SpeechRecognition wants the full tag.
      expect(lang.bcp47).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });

  it("offers the default language it falls back to", () => {
    for (const code of DEFAULT_VOICE_LANGUAGES) {
      expect(getVoiceLanguage(code)).toBeDefined();
    }
  });

  it("looks a language up by code, and misses cleanly", () => {
    expect(getVoiceLanguage("ta")?.englishName).toBe("Tamil");
    expect(getVoiceLanguage("xx")).toBeUndefined();
  });
});

describe("normalizeVoiceLanguages — a stored list is untrusted", () => {
  it("keeps known codes in the order given", () => {
    expect(normalizeVoiceLanguages(["ta", "en", "te"])).toEqual(["ta", "en", "te"]);
  });

  it("drops unknown codes", () => {
    expect(normalizeVoiceLanguages(["en", "klingon", "xx"])).toEqual(["en"]);
  });

  it("dedupes, case-insensitively", () => {
    expect(normalizeVoiceLanguages(["en", "EN", " en "])).toEqual(["en"]);
  });

  it(`caps the list at ${MAX_VOICE_LANGUAGES}`, () => {
    const many = VOICE_LANGUAGES.map((l) => l.code);
    expect(many.length).toBeGreaterThan(MAX_VOICE_LANGUAGES);
    expect(normalizeVoiceLanguages(many)).toHaveLength(MAX_VOICE_LANGUAGES);
  });

  it("skips non-string entries rather than failing", () => {
    expect(normalizeVoiceLanguages(["ta", 42, null, undefined, {}, "en"])).toEqual(["ta", "en"]);
  });

  it("falls back to the default when nothing valid survives", () => {
    expect(normalizeVoiceLanguages([])).toEqual(DEFAULT_VOICE_LANGUAGES);
    expect(normalizeVoiceLanguages(["nope"])).toEqual(DEFAULT_VOICE_LANGUAGES);
    expect(normalizeVoiceLanguages(null)).toEqual(DEFAULT_VOICE_LANGUAGES);
    expect(normalizeVoiceLanguages("en")).toEqual(DEFAULT_VOICE_LANGUAGES);
    expect(normalizeVoiceLanguages(undefined)).toEqual(DEFAULT_VOICE_LANGUAGES);
  });
});

describe("describeVoiceLanguages — the phrase the model is given", () => {
  it("names one language plainly", () => {
    expect(describeVoiceLanguages(["ta"])).toBe("Tamil");
  });

  it("joins two with 'and'", () => {
    expect(describeVoiceLanguages(["ta", "en"])).toBe("Tamil and English");
  });

  it("comma-separates three or more, with a final 'and'", () => {
    expect(describeVoiceLanguages(["ta", "te", "en"])).toBe("Tamil, Telugu and English");
  });

  it("describes the fallback when the list is unusable", () => {
    expect(describeVoiceLanguages(["nope"])).toBe("English");
  });
});

describe("primaryBcp47 — the one tag the browser recognizer accepts", () => {
  it("uses the first selected language", () => {
    expect(primaryBcp47(["ta", "en"])).toBe("ta-IN");
    expect(primaryBcp47(["en", "ta"])).toBe("en-IN");
  });

  it("falls back for an unusable list", () => {
    expect(primaryBcp47([])).toBe("en-IN");
    expect(primaryBcp47(["nope"])).toBe("en-IN");
  });
});
