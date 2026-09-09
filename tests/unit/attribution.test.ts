import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ATTRIBUTION_MAX_AGE_MS,
  ATTRIBUTION_STORAGE_KEY,
  attributionFromLanding,
  attributionInputSchema,
  captureAttribution,
  clearStoredAttribution,
  hasChannelSignal,
  landingFor,
  HEARD_FROM_OPTIONS,
  heardFromSchema,
  readStoredAttribution,
} from "@/lib/attribution";

const NOW = new Date("2026-09-07T10:00:00.000Z");

describe("attributionFromLanding", () => {
  it("keeps UTM tags, ?ref= and the referring host, and only the landing path", () => {
    const url = new URL(
      "https://spendchat.app/features/voice-expense-tracker?utm_source=hn&utm_medium=social&utm_campaign=launch&utm_content=comment&ref=openalternative&secret=1",
    );
    expect(attributionFromLanding(url, "https://News.Ycombinator.com/item?id=1", NOW)).toEqual({
      source: "hn",
      medium: "social",
      campaign: "launch",
      content: "comment",
      ref: "openalternative",
      referrer: "news.ycombinator.com",
      landing: "/features/voice-expense-tracker",
      capturedAt: NOW.toISOString(),
    });
  });

  it("treats our own hosts as no referrer, and a bad referrer as none", () => {
    const url = new URL("https://spendchat.app/");
    expect(attributionFromLanding(url, "https://beta.spendchat.app/blog", NOW).referrer).toBeNull();
    expect(attributionFromLanding(url, "http://localhost:3010/", NOW).referrer).toBeNull();
    expect(attributionFromLanding(url, "not a url", NOW).referrer).toBeNull();
    expect(attributionFromLanding(url, "", NOW).referrer).toBeNull();
  });

  it("truncates oversized tags so the record always passes the schema", () => {
    const url = new URL(`https://spendchat.app/?utm_source=${"x".repeat(500)}`);
    const record = attributionFromLanding(url, "", NOW);
    expect(record.source).toHaveLength(100);
    expect(attributionInputSchema.safeParse(record).success).toBe(true);
  });

  it("strips characters Postgres jsonb cannot store, and never leaves a lone surrogate", () => {
    // A crafted `?utm_source=%00` must not become a record that makes the
    // users INSERT — and so the sign-up — fail for the next 30 days.
    const nul = new URL("https://spendchat.app/?utm_source=%00&ref=a%00b");
    const record = attributionFromLanding(nul, "", NOW);
    expect(record.source).toBeNull();
    expect(record.ref).toBe("ab");
    expect(attributionInputSchema.safeParse(record).success).toBe(true);
    expect(attributionInputSchema.safeParse({ source: "a\u0000b" }).success).toBe(false);
    expect(attributionInputSchema.safeParse({ source: "\ud83d" }).success).toBe(false);
    expect(attributionInputSchema.safeParse({ landing: "/x\u0000" }).success).toBe(false);

    const emojiEdge = new URL(`https://spendchat.app/?utm_source=${"x".repeat(99)}😀`);
    const cut = attributionFromLanding(emojiEdge, "", NOW).source!;
    expect(cut.length).toBeLessThanOrEqual(100);
    expect(cut).toMatch(/^[^\p{Cs}]*$/u);
    expect(attributionInputSchema.safeParse({ source: cut }).success).toBe(true);
  });

  it("keeps public content paths and collapses everything else to its first segment", () => {
    expect(landingFor("/")).toBe("/");
    expect(landingFor("/features/voice-expense-tracker")).toBe("/features/voice-expense-tracker");
    expect(landingFor("/blog/some-post")).toBe("/blog/some-post");
    expect(landingFor("/compare/splitwise")).toBe("/compare/splitwise");
    // A share link's secret token must never be stored.
    expect(landingFor("/share/abc123secret")).toBe("/share");
    expect(landingFor("/app/settings/workspace")).toBe("/app");
    expect(landingFor("/pricing")).toBe("/pricing");
  });

  it("hasChannelSignal is false for a bare direct visit", () => {
    const direct = attributionFromLanding(new URL("https://spendchat.app/pricing"), "", NOW);
    expect(hasChannelSignal(direct)).toBe(false);
    expect(hasChannelSignal({ ...direct, ref: "producthunt" })).toBe(true);
    expect(hasChannelSignal({ ...direct, referrer: "reddit.com" })).toBe(true);
  });
});

describe("attributionInputSchema (what the session route accepts)", () => {
  it("rejects unknown keys, full URLs as referrers and non-path landings", () => {
    expect(attributionInputSchema.safeParse({ source: "hn", url: "https://x" }).success).toBe(false);
    expect(attributionInputSchema.safeParse({ referrer: "https://reddit.com/r/x" }).success).toBe(false);
    expect(attributionInputSchema.safeParse({ landing: "/?token=abc" }).success).toBe(false);
    expect(attributionInputSchema.safeParse({ landing: "features" }).success).toBe(false);
    expect(attributionInputSchema.safeParse({ capturedAt: "yesterday" }).success).toBe(false);
    expect(attributionInputSchema.safeParse(null).success).toBe(false);
  });
  it("accepts a sparse record", () => {
    expect(attributionInputSchema.safeParse({ ref: "producthunt", referrer: null }).success).toBe(true);
    expect(attributionInputSchema.safeParse({}).success).toBe(true);
  });
});

describe("heardFromSchema", () => {
  it("covers every chip on the card plus a skip", () => {
    for (const o of HEARD_FROM_OPTIONS) expect(heardFromSchema.safeParse(o.value).success).toBe(true);
    expect(heardFromSchema.safeParse("skipped").success).toBe(true);
    expect(heardFromSchema.safeParse("tiktok").success).toBe(false);
  });
});

describe("captureAttribution / readStoredAttribution (browser)", () => {
  const store = new Map<string, string>();
  function browser(href: string, referrer: string) {
    vi.stubGlobal("window", {
      location: { href },
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    vi.stubGlobal("document", { referrer });
  }
  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  it("records a channel touch and keeps it over later visits", () => {
    browser("https://spendchat.app/?ref=producthunt", "https://www.producthunt.com/");
    captureAttribution(NOW);
    expect(readStoredAttribution(NOW)).toMatchObject({ ref: "producthunt", referrer: "www.producthunt.com" });

    browser("https://spendchat.app/pricing?utm_source=reddit", "https://reddit.com/");
    captureAttribution(new Date(NOW.getTime() + 1000));
    expect(readStoredAttribution(NOW)).toMatchObject({ ref: "producthunt" });
  });

  it("lets a tagged visit replace a stored direct one", () => {
    browser("https://spendchat.app/", "");
    captureAttribution(NOW);
    expect(readStoredAttribution(NOW)).toMatchObject({ referrer: null, ref: null, landing: "/" });

    browser("https://spendchat.app/?utm_source=hn", "https://news.ycombinator.com/");
    captureAttribution(new Date(NOW.getTime() + 1000));
    expect(readStoredAttribution(NOW)).toMatchObject({ source: "hn" });
  });

  it("drops a stale or malformed record", () => {
    browser("https://spendchat.app/?ref=hn", "");
    captureAttribution(NOW);
    expect(readStoredAttribution(new Date(NOW.getTime() + ATTRIBUTION_MAX_AGE_MS + 1))).toBeNull();
    store.set(ATTRIBUTION_STORAGE_KEY, "{not json");
    expect(readStoredAttribution(NOW)).toBeNull();
    store.set(ATTRIBUTION_STORAGE_KEY, JSON.stringify({ referrer: "https://evil/?x" }));
    expect(readStoredAttribution(NOW)).toBeNull();
  });

  it("clearStoredAttribution forgets the record after a successful session POST", () => {
    browser("https://spendchat.app/?ref=hn", "");
    captureAttribution(NOW);
    expect(readStoredAttribution(NOW)).not.toBeNull();
    clearStoredAttribution();
    expect(readStoredAttribution(NOW)).toBeNull();
  });

  it("is a no-op outside the browser", () => {
    expect(readStoredAttribution(NOW)).toBeNull();
    expect(() => captureAttribution(NOW)).not.toThrow();
  });
});
