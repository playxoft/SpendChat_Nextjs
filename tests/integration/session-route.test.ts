import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { POST, DELETE } from "@/app/api/auth/session/route";
import { REFRESH_COOKIE, SESSION_COOKIE, SESSION_HINT_COOKIE } from "@/lib/session-cookie";
import { setSession, signInAs } from "./helpers/session";

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
