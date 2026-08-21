import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHandoffServerSnapshot,
  getHandoffSnapshot,
  handoffView,
  hasSessionHint,
  isPromptDismissed,
  prefersApp,
  setPrefersApp,
  type HandoffState,
  type HandoffView,
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

describe("isPromptDismissed", () => {
  it("is false, not a crash, in a browser that blocks storage", () => {
    // Chrome with all cookies blocked (and a partitioned or sandboxed context)
    // throws from the `sessionStorage` accessor itself, so even
    // `typeof sessionStorage` throws. The check has to sit *inside* the try, or
    // the guard against storage throwing is the throw — on a path
    // `useSyncExternalStore` runs during every render of the landing page.
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    try {
      expect(isPromptDismissed()).toBe(false);
      expect(() => getHandoffSnapshot()).not.toThrow();
    } finally {
      Reflect.deleteProperty(globalThis, "sessionStorage");
    }
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

/**
 * Every combination of the four inputs, written out rather than derived, so the
 * table states the intended semantics instead of restating the implementation.
 * The two rows worth reading twice are `stay` + `dismissed` (the close button
 * has to work on `/?stay=1`, which is where a visitor with the preference on
 * always lands) and `prefers` + `dismissed` (dismissing silences the card; it
 * never cancels a preference the visitor set deliberately).
 *
 * The table is run **as at arrival** — `arrivedWithPreference` mirrors
 * `signedIn && prefers`, which is the state a page load actually presents. The
 * cases where it does *not* mirror them (a tick, or a session that appears
 * mid-visit) are the separate tests below, and they're the whole reason the
 * option exists.
 */
const state = (
  signedIn: boolean,
  prefers: boolean,
  dismissed: boolean,
  stay: boolean,
): HandoffState => ({ signedIn, prefers, dismissed, stay });

const onArrival = (s: HandoffState) =>
  handoffView(s, { arrivedWithPreference: s.signedIn && s.prefers });

const TABLE: [HandoffState, HandoffView][] = [
  // Signed out: nothing at all, whatever else is set. This is every crawler and
  // every stranger, i.e. the landing page's actual audience.
  [state(false, false, false, false), "hidden"],
  [state(false, false, false, true), "hidden"],
  [state(false, false, true, false), "hidden"],
  [state(false, false, true, true), "hidden"],
  [state(false, true, false, false), "hidden"],
  [state(false, true, false, true), "hidden"],
  [state(false, true, true, false), "hidden"],
  [state(false, true, true, true), "hidden"],
  // Signed in, no preference: offer once per visit, and stay quiet after the X.
  [state(true, false, false, false), "card"],
  [state(true, false, false, true), "card"],
  [state(true, false, true, false), "hidden"],
  [state(true, false, true, true), "hidden"],
  // Signed in with the preference: straight through, unless `?stay=1` says the
  // visitor came here to change it.
  [state(true, true, false, false), "redirect"],
  [state(true, true, false, true), "card"],
  [state(true, true, true, false), "redirect"],
  // …and the X works there, which it did not when the gate read
  // `dismissed && !prefers`. (Arriving on `?stay=1` clears an *older*
  // dismissal — see `clearPromptDismissal` — so this row is the visitor
  // pressing X on the card in front of them.)
  [state(true, true, true, true), "hidden"],
];

describe("handoffView", () => {
  it.each(TABLE)("%o → %s", (input, expected) => {
    expect(onArrival(input)).toBe(expected);
  });

  it("does not redirect on the tick that sets the preference", () => {
    // Otherwise the checkbox is a one-click one-way door: ticking it on `/`
    // yanks the visitor to the app before they can untick it, and the only way
    // back is a URL they have never been shown. A tick means `prefers` is true
    // now but was not at arrival.
    const ticked = state(true, true, false, false);
    expect(handoffView(ticked, { arrivedWithPreference: true })).toBe("redirect");
    expect(handoffView(ticked, { arrivedWithPreference: false })).toBe("card");
  });

  it("does not redirect when the session appears mid-visit", () => {
    // `sc_go_to_app` lives 180 days and the session hint 30, so a visitor can
    // hold the preference while signed out. They land on `/`, start reading,
    // sign in in another tab, and come back to this one — which re-reads the
    // cookies on focus. Acting on the preference *then* would navigate them off
    // a page they had settled on, so arrival is what counts.
    expect(handoffView(state(true, true, false, false), { arrivedWithPreference: false })).toBe(
      "card",
    );
  });

  it("still hides the card after the tick if it was already dismissed", () => {
    expect(
      handoffView(state(true, true, true, false), { arrivedWithPreference: false }),
    ).toBe("hidden");
  });

  it("gives the page back when the redirect never arrives", () => {
    // The cover is an opaque modal; without this the visitor is left staring at
    // a spinner with no way to reach the checkbox that put it there.
    expect(
      handoffView(state(true, true, false, false), {
        arrivedWithPreference: true,
        stalled: true,
      }),
    ).toBe("card");
  });

  it("lets an untick take effect during a stalled redirect", () => {
    // The card shown after a stall is the only place to turn this off, so the
    // live cookie has to win over what arrival looked like.
    expect(
      handoffView(state(true, false, false, false), {
        arrivedWithPreference: true,
        stalled: true,
      }),
    ).toBe("card");
  });
});
