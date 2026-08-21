import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHandoffServerSnapshot,
  getHandoffSnapshot,
  hasSessionHint,
  prefersApp,
  setPrefersApp,
} from "@/lib/app-redirect";

/**
 * The landing page decides whether to hand a signed-in visitor straight to the
 * app by reading two cookies in the browser. Getting that read wrong fails in
 * one of two directions, and both are bad in a way a glance at the UI wouldn't
 * catch: a false negative silently disables the feature, while a false positive
 * redirects a signed-out stranger away from the marketing page — the one page
 * the business needs strangers to see.
 *
 * These run under the `node` environment (see vitest.config.ts), so `document`
 * and `window` are stubbed rather than provided by jsdom.
 */

let cookieJar = "";

beforeEach(() => {
  cookieJar = "";
  vi.stubGlobal("document", {
    get cookie() {
      return cookieJar;
    },
    set cookie(value: string) {
      // Enough of the real setter for these tests: last write wins per name,
      // and `max-age=0` deletes.
      const [pair, ...attrs] = value.split(";");
      const [name, val] = pair!.split("=");
      const entries = new Map(
        cookieJar
          .split("; ")
          .filter(Boolean)
          .map((c) => {
            const i = c.indexOf("=");
            return [c.slice(0, i), c.slice(i + 1)] as const;
          }),
      );
      if (attrs.some((a) => a.trim().toLowerCase() === "max-age=0")) entries.delete(name!.trim());
      else entries.set(name!.trim(), val ?? "");
      cookieJar = [...entries].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  });
  vi.stubGlobal("window", {
    dispatchEvent: () => true,
    location: { search: "" },
  });
  vi.stubGlobal("sessionStorage", {
    getItem: () => null,
    setItem: () => undefined,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("hasSessionHint", () => {
  it("is false with no cookies — the signed-out default", () => {
    expect(hasSessionHint()).toBe(false);
  });

  it("reads the hint the session route sets", () => {
    cookieJar = "sc_signed_in=1";
    expect(hasSessionHint()).toBe(true);
  });

  it("finds it among other cookies, in any position", () => {
    cookieJar = "cookie_consent=granted; sc_signed_in=1; sc_go_to_app=1";
    expect(hasSessionHint()).toBe(true);
    cookieJar = "sc_signed_in=1; cookie_consent=granted";
    expect(hasSessionHint()).toBe(true);
  });

  it("does not match a cookie that merely ends with the name", () => {
    // The prefix boundary matters: without it, some other product's
    // `not_sc_signed_in=1` would hand a stranger the signed-in experience.
    cookieJar = "not_sc_signed_in=1";
    expect(hasSessionHint()).toBe(false);
  });

  it("treats any value other than 1 as signed out", () => {
    cookieJar = "sc_signed_in=";
    expect(hasSessionHint()).toBe(false);
    cookieJar = "sc_signed_in=0";
    expect(hasSessionHint()).toBe(false);
  });
});

describe("setPrefersApp", () => {
  it("round-trips the preference", () => {
    expect(prefersApp()).toBe(false);
    setPrefersApp(true);
    expect(prefersApp()).toBe(true);
  });

  it("clears it, so unticking the box is a way back to the landing page", () => {
    setPrefersApp(true);
    setPrefersApp(false);
    expect(prefersApp()).toBe(false);
  });

  it("leaves other cookies alone", () => {
    cookieJar = "cookie_consent=granted";
    setPrefersApp(true);
    expect(cookieJar).toContain("cookie_consent=granted");
    setPrefersApp(false);
    expect(cookieJar).toContain("cookie_consent=granted");
  });
});

describe("getHandoffSnapshot", () => {
  it("returns the same reference while nothing changes", () => {
    // useSyncExternalStore compares by identity; a fresh object every call is
    // an infinite render loop on the landing page.
    cookieJar = "sc_signed_in=1";
    expect(getHandoffSnapshot()).toBe(getHandoffSnapshot());
  });

  it("returns a new reference once a cookie changes", () => {
    cookieJar = "sc_signed_in=1";
    const before = getHandoffSnapshot();
    setPrefersApp(true);
    const after = getHandoffSnapshot();
    expect(after).not.toBe(before);
    expect(after).toMatchObject({ signedIn: true, prefers: true });
  });

  it("reports signed out on the server, so the prerendered HTML has no prompt", () => {
    expect(getHandoffServerSnapshot()).toEqual({
      signedIn: false,
      prefers: false,
      dismissed: false,
      stay: false,
    });
  });

  it("picks up ?stay=1, the escape hatch back to the landing page", () => {
    cookieJar = "sc_signed_in=1; sc_go_to_app=1";
    expect(getHandoffSnapshot().stay).toBe(false);
    vi.stubGlobal("window", { dispatchEvent: () => true, location: { search: "?stay=1" } });
    expect(getHandoffSnapshot().stay).toBe(true);
  });
});
