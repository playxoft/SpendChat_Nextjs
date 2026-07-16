import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { POST, DELETE } from "@/app/api/auth/session/route";
import { setSession, signInAs } from "./helpers/session";

/**
 * The session bridge's login-CSRF guard: cross-site requests must never set or
 * clear the auth cookies. Token verification itself is mocked (see setup.ts);
 * what runs for real here is the origin gate and the request parsing.
 */

function req(init: RequestInit = {}): NextRequest {
  return new Request("http://localhost/api/auth/session", init) as NextRequest;
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
  });
});
