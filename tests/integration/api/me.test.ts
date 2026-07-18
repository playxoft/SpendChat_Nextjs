import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/v1/me/route";
import { setSession, signInAs, uid } from "../helpers/session";
import { apiReq } from "./helpers";

describe("GET /api/v1/me", () => {
  it("401s without a bearer token", async () => {
    setSession(null);
    const res = await GET(apiReq("/api/v1/me", { auth: false }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("unauthorized");
  });

  it("returns the user, user settings, and the current workspace with its currency", async () => {
    signInAs("user-1");
    const res = await GET(apiReq("/api/v1/me"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.user).toEqual({
      id: uid("user-1"),
      email: "user-1@example.com",
      name: "user-1",
    });
    // User settings no longer carry currency/locale — only theme + input mode.
    expect(data.settings.inputMode).toBe("amount_title");
    expect(data.settings.currency).toBeUndefined();
    // Currency + number format now live on the workspace.
    expect(data.workspace.currency).toBe("USD");
    expect(data.workspace.locale).toBe("en-US");
    expect(data.workspace.currencyDetail).toEqual({ code: "USD", symbol: "$", decimals: 2 });
  });
});
