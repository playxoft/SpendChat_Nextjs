import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/v1/me/route";
import { setSession, signInAs } from "../helpers/session";
import { apiReq } from "./helpers";

describe("GET /api/v1/me", () => {
  it("401s without a bearer token", async () => {
    setSession(null);
    const res = await GET(apiReq("/api/v1/me", { auth: false }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
  });

  it("returns the user and bootstrapped settings", async () => {
    signInAs("user-1");
    const res = await GET(apiReq("/api/v1/me"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.user).toEqual({ id: "user-1", email: "user-1@example.com", name: "user-1" });
    expect(data.settings.currency).toBe("USD");
    expect(data.settings.currencyDetail).toEqual({ code: "USD", symbol: "$", decimals: 2 });
    expect(data.settings.inputMode).toBe("amount_title");
  });
});
