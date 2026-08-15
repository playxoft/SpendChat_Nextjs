import { describe, it, expect } from "vitest";
import { GET as apiVersion } from "@/app/api/v1/version/route";
import { GET as rootVersion } from "@/app/version/route";
import { API_VERSION, APP_VERSION } from "@/lib/version";
import { setSession } from "../helpers/session";

describe("GET /api/v1/version", () => {
  it("answers signed out — no bearer token, no workspace, no 401", async () => {
    setSession(null);
    const res = await apiVersion();
    expect(res.status).toBe(200);
    // Clients poll this to notice a new deploy; a cached answer would hide one.
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(body.data).toEqual({
      name: "SpendChat",
      version: APP_VERSION,
      apiVersion: API_VERSION,
      environment: "development",
      // No Worker context under test, so no deploy identity to report.
      build: null,
      changelog: {
        app: expect.stringContaining("/CHANGELOG.md"),
        api: expect.stringContaining("/_changelog.md"),
      },
    });
  });

  it("is byte-for-byte the same at the /version alias", async () => {
    setSession(null);
    const [scoped, root] = await Promise.all([apiVersion(), rootVersion()]);
    expect(root.status).toBe(scoped.status);
    expect(await root.json()).toEqual(await scoped.json());
  });
});
