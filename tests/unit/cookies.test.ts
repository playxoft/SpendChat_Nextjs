import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteCookie, readCookie, writeCookie } from "@/lib/cookies";

/**
 * The browser's own cookies — consent, timezone, and the landing page's handoff
 * preference — all go through this one module. It's small, but it's the only
 * place the attributes are written, so a mistake here is a mistake in all three
 * at once: a missed `path=/` scopes a cookie to the page that set it, and a
 * missed prefix boundary on the read matches a different cookie entirely.
 */

/** Every `document.cookie = …` write, in order. */
let writes: string[] = [];
let cookieJar = "";

beforeEach(() => {
  writes = [];
  cookieJar = "";
  vi.stubGlobal("document", {
    get cookie() {
      return cookieJar;
    },
    set cookie(value: string) {
      writes.push(value);
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("readCookie", () => {
  it("reads a value from anywhere in the jar", () => {
    cookieJar = "a=1; tz=Asia/Kolkata; cookie_consent=granted";
    expect(readCookie("tz")).toBe("Asia/Kolkata");
    expect(readCookie("a")).toBe("1");
    expect(readCookie("cookie_consent")).toBe("granted");
  });

  it("is null for a cookie that isn't there", () => {
    cookieJar = "a=1";
    expect(readCookie("b")).toBeNull();
  });

  it("matches on a name boundary, not a suffix", () => {
    cookieJar = "not_tz=UTC";
    expect(readCookie("tz")).toBeNull();
  });

  it("survives a value that isn't valid percent-encoding", () => {
    // Written by something other than us — decoding throws, and the raw text is
    // a better answer than an exception on the landing page.
    cookieJar = "x=100%";
    expect(readCookie("x")).toBe("100%");
  });

  it("returns an empty value rather than treating it as missing", () => {
    // The callers decide what an empty value means; conflating it with "absent"
    // here would hide a cookie that was cleared by writing an empty string.
    cookieJar = "tz=";
    expect(readCookie("tz")).toBe("");
  });

  it("escapes the name before it reaches the regex", () => {
    cookieJar = "a.b=1";
    // Unescaped, the "." would also match "axb" — and, with a name chosen less
    // kindly, could match nothing at all or throw.
    expect(readCookie("a.b")).toBe("1");
    cookieJar = "axb=2";
    expect(readCookie("a.b")).toBeNull();
  });
});

describe("writeCookie", () => {
  it("scopes to the whole site and sets the max-age it was given", () => {
    writeCookie("tz", "Asia/Kolkata", 60);
    // Percent-encoded on the way out; Next's parser decodes on the way in, so
    // the server still reads "Asia/Kolkata".
    expect(writes).toEqual(["tz=Asia%2FKolkata; path=/; max-age=60; samesite=lax"]);
  });

  it("encodes a value that would otherwise truncate the cookie", () => {
    // A raw ";" ends the value and turns its tail into a bogus attribute — the
    // stored cookie would silently be "a" and the rest would vanish.
    writeCookie("x", "a; max-age=0", 60);
    expect(writes[0]).toBe("x=a%3B%20max-age%3D0; path=/; max-age=60; samesite=lax");
  });

  it("round-trips through readCookie", () => {
    writeCookie("x", "a; b=c, d /e", 60);
    cookieJar = writes[0]!.split(";")[0]!;
    expect(readCookie("x")).toBe("a; b=c, d /e");
  });

  it("omits Secure off https, where the browser would refuse the cookie", () => {
    // Safari treats plain-http localhost as insecure and drops a Secure cookie
    // there, which would silently break local dev.
    vi.stubGlobal("location", { protocol: "http:" });
    writeCookie("tz", "UTC", 60);
    expect(writes[0]).not.toContain("secure");
  });

  it("sets Secure on https", () => {
    vi.stubGlobal("location", { protocol: "https:" });
    writeCookie("tz", "UTC", 60);
    expect(writes[0]).toContain("; secure");
  });
});

describe("deleteCookie", () => {
  it("expires it on the same path it was written to", () => {
    // A cookie is only replaced by one with a matching name *and* path — drop
    // the `path=/` and the delete silently leaves the original in place.
    deleteCookie("sc_go_to_app");
    expect(writes).toEqual(["sc_go_to_app=; path=/; max-age=0; samesite=lax"]);
  });
});
