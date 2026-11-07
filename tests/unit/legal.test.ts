import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGE_RULES,
  LEGAL_VERSION,
  TERMS_STORAGE_KEY,
  clearStoredTermsAcceptance,
  hasStoredTermsAcceptance,
  isCurrentLegalVersion,
  readStoredTermsAcceptance,
  storeTermsAcceptance,
} from "@/lib/legal";

const NOW = new Date("2026-11-05T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("isCurrentLegalVersion", () => {
  it("accepts only the bundle in force", () => {
    expect(isCurrentLegalVersion(LEGAL_VERSION)).toBe(true);
    expect(isCurrentLegalVersion("2020-01-01")).toBe(false);
    expect(isCurrentLegalVersion(undefined)).toBe(false);
    expect(isCurrentLegalVersion(null)).toBe(false);
    expect(isCurrentLegalVersion({ version: LEGAL_VERSION })).toBe(false);
  });

  it("is a real date, so the app layout can compare account ages against it", () => {
    expect(Number.isFinite(Date.parse(`${LEGAL_VERSION}T00:00:00Z`))).toBe(true);
  });
});

describe("the age rules in force", () => {
  it("are 13 and older, with a parent's OK under 18", () => {
    expect(AGE_RULES).toEqual({ minAge: 13, adultAge: 18 });
  });
});

describe("the email sign-up stash", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  it("is picked up by the account that ticked the box, and holds no email", () => {
    storeTermsAcceptance("uid-1", undefined, NOW);
    expect(hasStoredTermsAcceptance("uid-1", new Date(NOW.getTime() + DAY))).toBe(true);
    expect(store.get(TERMS_STORAGE_KEY)).not.toMatch(/@/);
  });

  it("is never handed to a different account on the same browser — and is left for its owner", () => {
    storeTermsAcceptance("uid-1", undefined, NOW);
    expect(hasStoredTermsAcceptance("uid-2", NOW)).toBe(false);
    expect(store.has(TERMS_STORAGE_KEY)).toBe(true);
  });

  it("expires after 14 days, and is removed rather than skipped", () => {
    storeTermsAcceptance("uid-1", undefined, NOW);
    expect(hasStoredTermsAcceptance("uid-1", new Date(NOW.getTime() + 15 * DAY))).toBe(false);
    expect(store.has(TERMS_STORAGE_KEY)).toBe(false);
  });

  it("drops an acceptance of an older version", () => {
    store.set(TERMS_STORAGE_KEY, JSON.stringify({ uid: "uid-1", version: "2020-01-01", at: NOW.toISOString() }));
    expect(hasStoredTermsAcceptance("uid-1", NOW)).toBe(false);
    expect(store.has(TERMS_STORAGE_KEY)).toBe(false);
  });

  it("drops a malformed entry", () => {
    store.set(TERMS_STORAGE_KEY, "{not json");
    expect(hasStoredTermsAcceptance("uid-1", NOW)).toBe(false);
    expect(store.has(TERMS_STORAGE_KEY)).toBe(false);
  });

  it("carries the optional news-emails choice — off unless it was ticked", () => {
    storeTermsAcceptance("uid-1", undefined, NOW);
    expect(readStoredTermsAcceptance("uid-1", NOW)).toEqual({ newsEmails: false });
    storeTermsAcceptance("uid-1", { newsEmails: true }, NOW);
    expect(readStoredTermsAcceptance("uid-1", NOW)).toEqual({ newsEmails: true });
    expect(readStoredTermsAcceptance("uid-2", NOW)).toBeNull();
    // A stash written before the box existed reads as "no".
    store.set(TERMS_STORAGE_KEY, JSON.stringify({ uid: "uid-1", version: LEGAL_VERSION, at: NOW.toISOString() }));
    expect(readStoredTermsAcceptance("uid-1", NOW)).toEqual({ newsEmails: false });
  });

  it("clears", () => {
    storeTermsAcceptance("uid-1", undefined, NOW);
    clearStoredTermsAcceptance();
    expect(hasStoredTermsAcceptance("uid-1", NOW)).toBe(false);
  });
});
