import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { POST, DELETE } from "@/app/api/auth/session/route";
import { users } from "@/db/schema";
import { LEGAL_VERSION } from "@/lib/legal";
import { REFRESH_COOKIE, SESSION_COOKIE, SESSION_HINT_COOKIE } from "@/lib/session-cookie";
import { setSession, signInAs } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";

/**
 * The session bridge's login-CSRF guard: cross-site requests must never set or
 * clear the auth cookies. Token verification itself is mocked (see setup.ts);
 * what runs for real here is the origin gate and the request parsing.
 */

function req(init: RequestInit = {}): NextRequest {
  return new Request("http://localhost/api/auth/session", init) as NextRequest;
}

/** The `Set-Cookie` line for one cookie, or undefined if the response didn't set it. */
function setCookie(res: Response, name: string): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
}

describe("POST /api/auth/session", () => {
  it("403s a cross-site request (Sec-Fetch-Site)", async () => {
    const res = await POST(
      req({
        method: "POST",
        headers: { "sec-fetch-site": "cross-site", "content-type": "text/plain" },
        body: JSON.stringify({ idToken: "attacker-token" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("403s a cross-origin request (Origin fallback, no Sec-Fetch-Site)", async () => {
    const res = await POST(
      req({
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: JSON.stringify({ idToken: "attacker-token" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400s a same-origin request without an idToken", async () => {
    const res = await POST(
      req({ method: "POST", headers: { "sec-fetch-site": "same-origin" }, body: "{}" }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts a same-origin sign-in", async () => {
    signInAs("sess");
    const res = await POST(
      req({
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ idToken: "token" }),
      }),
    );
    expect(res.status).toBe(200);
    setSession(null);
  });

  // The cookies ride on the response rather than `cookies()` from next/headers,
  // which throws once the client disconnects mid-request (see the route).
  it("sets the session, hint and refresh cookies on the response", async () => {
    signInAs("sess");
    const res = await POST(
      req({
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ idToken: "token", refreshToken: "refresh" }),
      }),
    );
    expect(res.status).toBe(200);

    const session = setCookie(res, SESSION_COOKIE);
    expect(session).toMatch(new RegExp(`^${SESSION_COOKIE}=token;`));
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Path=\//);
    expect(session).toMatch(/SameSite=lax/i);

    expect(setCookie(res, REFRESH_COOKIE)).toMatch(new RegExp(`^${REFRESH_COOKIE}=refresh;.*HttpOnly`, "i"));

    // The hint is read by the static landing page's script, so it must not be httpOnly.
    const hint = setCookie(res, SESSION_HINT_COOKIE);
    expect(hint).toMatch(new RegExp(`^${SESSION_HINT_COOKIE}=1;`));
    expect(hint).not.toMatch(/HttpOnly/i);
    setSession(null);
  });

  it("leaves the refresh cookie alone when none is sent", async () => {
    signInAs("sess");
    const res = await POST(
      req({
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ idToken: "token" }),
      }),
    );
    expect(setCookie(res, SESSION_COOKIE)).toBeDefined();
    expect(setCookie(res, REFRESH_COOKIE)).toBeUndefined();
    setSession(null);
  });

  it("allows non-browser clients (no Origin, no Sec-Fetch-Site — no cookies to ride)", async () => {
    signInAs("sess");
    const res = await POST(req({ method: "POST", body: JSON.stringify({ idToken: "token" }) }));
    expect(res.status).toBe(200);
    setSession(null);
  });
});

describe("POST /api/auth/session — terms acceptance", () => {
  async function signInWith(terms: unknown) {
    const user = signInAs("terms");
    const res = await POST(
      req({
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ idToken: "token", terms }),
      }),
    );
    const [row] = await getTestDb()
      .select({ version: users.termsVersion, at: users.termsAcceptedAt, news: users.newsEmailsAt })
      .from(users)
      .where(eq(users.id, user.id));
    setSession(null);
    return { res, row };
  }

  it("records a yes to product news only when its box was ticked too", async () => {
    const { row: unticked } = await signInWith({ version: LEGAL_VERSION });
    expect(unticked?.news).toBeNull();
    const { row: ticked } = await signInWith({ version: LEGAL_VERSION, newsEmails: true });
    expect(ticked?.news).toBeInstanceOf(Date);
    // A later sign-in without the tick doesn't take an earlier yes back.
    const { row: later } = await signInWith({ version: LEGAL_VERSION, newsEmails: false });
    expect(later?.news?.getTime()).toBe(ticked?.news?.getTime());
  });

  it("never takes a news yes without a valid terms acceptance beside it", async () => {
    const { row } = await signInWith({ version: "2020-01-01", newsEmails: true });
    expect(row?.news).toBeNull();
  });

  it("records the current version when the browser saw the box ticked", async () => {
    const { res, row } = await signInWith({ version: LEGAL_VERSION });
    expect(res.status).toBe(200);
    expect(row?.version).toBe(LEGAL_VERSION);
    expect(row?.at).toBeInstanceOf(Date);
  });

  it("ignores a stale version — the in-app gate asks instead", async () => {
    const { res, row } = await signInWith({ version: "2020-01-01" });
    expect(res.status).toBe(200);
    expect(row?.version).toBeNull();
    expect(row?.at).toBeNull();
  });

  it("records nothing when no acceptance is sent", async () => {
    const { row } = await signInWith(undefined);
    expect(row?.version).toBeNull();
  });
});

describe("POST /api/auth/session — a new account from the sign-in page", () => {
  async function post(body: Record<string, unknown>) {
    return POST(
      req({
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
        body: JSON.stringify({ idToken: "token", ...body }),
      }),
    );
  }
  const rowsFor = (id: string) =>
    getTestDb().select({ id: users.id, version: users.termsVersion }).from(users).where(eq(users.id, id));

  it("asks for the terms instead of creating an account — no row, no cookies", async () => {
    const user = signInAs("newg");
    const res = await post({ askTermsIfNew: true });
    expect(res.status).toBe(428);
    expect(await res.json()).toMatchObject({ error: "terms_required" });
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await rowsFor(user.id)).toEqual([]);
  });

  it("creates it once the terms come with the retry", async () => {
    const user = signInAs("newg");
    const res = await post({ askTermsIfNew: true, terms: { version: LEGAL_VERSION } });
    expect(res.status).toBe(200);
    expect(await rowsFor(user.id)).toEqual([{ id: user.id, version: LEGAL_VERSION }]);
  });

  it("lets an existing account straight in", async () => {
    const user = signInAs("oldg");
    await getTestDb()
      .insert(users)
      .values({ id: user.id, firebaseUid: `fb-${user.id}`, email: user.email, name: user.name });
    const res = await post({ askTermsIfNew: true });
    expect(res.status).toBe(200);
  });

  it("lets a Google login reach the email account it will be linked to", async () => {
    const user = signInAs("linkg");
    // Same address, a different id: what `resolveUser` links by verified email.
    await getTestDb()
      .insert(users)
      .values({ firebaseUid: "fb-email-password", email: user.email.toUpperCase(), name: user.name });
    const res = await post({ askTermsIfNew: true });
    expect(res.status).toBe(200);
  });

  it("changes nothing for callers that don't ask (the in-app gate catches them)", async () => {
    const user = signInAs("plain");
    const res = await post({});
    expect(res.status).toBe(200);
    expect(await rowsFor(user.id)).toHaveLength(1);
  });
});

describe("DELETE /api/auth/session", () => {
  it("403s a cross-site sign-out (forced logout)", async () => {
    const res = await DELETE(
      req({ method: "DELETE", headers: { "sec-fetch-site": "cross-site" } }),
    );
    expect(res.status).toBe(403);
  });

  it("clears the session same-origin", async () => {
    const res = await DELETE(
      req({ method: "DELETE", headers: { "sec-fetch-site": "same-origin" } }),
    );
    expect(res.status).toBe(200);
    // All three expire, on the same path they were set with.
    for (const name of [SESSION_COOKIE, REFRESH_COOKIE, SESSION_HINT_COOKIE]) {
      const line = setCookie(res, name);
      expect(line, name).toMatch(new RegExp(`^${name}=;`));
      expect(line, name).toMatch(/Max-Age=0/i);
      expect(line, name).toMatch(/Path=\//);
    }
  });
});
