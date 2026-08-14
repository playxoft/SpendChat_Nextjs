import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Swappable stand-in for the Worker context: `getCloudflareContext()` throws
// outside a request, which is exactly the case `resolveBuild` has to survive.
let cloudflareContext: () => { env: Record<string, unknown> };
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => cloudflareContext(),
}));

import { APP_VERSION, API_VERSION, getVersionInfo } from "@/lib/version";

const read = (file: string) =>
  readFileSync(path.resolve(process.cwd(), file), "utf8");

const SEMVER = /^\d+\.\d+\.\d+$/;

beforeEach(() => {
  cloudflareContext = () => {
    throw new Error("Cloudflare context is not available outside a request");
  };
  vi.stubEnv("APP_ENV", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getVersionInfo", () => {
  it("reports the app release, the API contract version, and the changelogs", () => {
    expect(getVersionInfo()).toEqual({
      name: "SpendChat",
      version: APP_VERSION,
      apiVersion: API_VERSION,
      environment: "development",
      build: null,
      changelog: {
        app: "https://github.com/playxoft/SpendChat_Nextjs/blob/master/CHANGELOG.md",
        api: "https://github.com/playxoft/SpendChat_Nextjs/blob/master/_developer/flutter/_changelog.md",
      },
    });
  });

  it("exposes these fields and nothing else", () => {
    // The payload is public and unauthenticated: adding a field is a deliberate
    // act (and an API version bump), never a side effect of another change.
    expect(Object.keys(getVersionInfo()).sort()).toEqual([
      "apiVersion",
      "build",
      "changelog",
      "environment",
      "name",
      "version",
    ]);
  });

  it("reports the deploy environment from APP_ENV", () => {
    for (const env of ["production", "beta"] as const) {
      vi.stubEnv("APP_ENV", env);
      expect(getVersionInfo().environment).toBe(env);
    }
  });

  it("reports an unrecognized APP_ENV as development rather than echoing it", () => {
    vi.stubEnv("APP_ENV", "staging");
    expect(getVersionInfo().environment).toBe("development");
  });

  it("reports the deployed Worker version when the binding is present", () => {
    cloudflareContext = () => ({
      env: {
        CF_VERSION_METADATA: {
          id: "c9a1f0d2-1b4e-4a77-9d2e-0c3b6f5a8e11",
          tag: "v42",
          timestamp: "2026-08-14T09:30:00Z",
        },
      },
    });
    expect(getVersionInfo().build).toEqual({
      id: "c9a1f0d2-1b4e-4a77-9d2e-0c3b6f5a8e11",
      deployedAt: "2026-08-14T09:30:00.000Z",
    });
  });

  it("keeps the build id when the upload timestamp is missing or unparseable", () => {
    for (const timestamp of [undefined, "not-a-date"]) {
      cloudflareContext = () => ({
        env: { CF_VERSION_METADATA: { id: "abc", tag: "", timestamp } },
      });
      expect(getVersionInfo().build).toEqual({ id: "abc", deployedAt: null });
    }
  });

  it("reports no build when the binding isn't bound yet", () => {
    cloudflareContext = () => ({ env: {} });
    expect(getVersionInfo().build).toBeNull();
  });

  it("reports no build outside a Worker request", () => {
    // Default `cloudflareContext` throws — local dev, tests, and build time.
    expect(getVersionInfo().build).toBeNull();
  });
});

/**
 * The point of `/version` is that it can't lie. These assertions are the
 * enforcement: the version the endpoint reports must be the version the
 * manifests and changelogs describe, or the suite fails.
 */
describe("version sources stay in sync", () => {
  it("reports package.json's version as the app version", () => {
    const pkg = JSON.parse(read("package.json")) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toMatch(SEMVER);
  });

  it("matches info.version in the OpenAPI spec", () => {
    const spec = read("_developer/flutter/openapi.yaml");
    const version = spec.match(/^info:$[\s\S]*?^ {2}version:\s*"([^"]+)"/m)?.[1];
    expect(version).toBe(API_VERSION);
    expect(API_VERSION).toMatch(SEMVER);
  });

  it("matches the API spec version in the human-readable reference", () => {
    const doc = read("_developer/flutter/01-api-reference.md");
    const version = doc.match(/\*\*API spec version:\s*([\d.]+)\.\*\*/)?.[1];
    expect(version).toBe(API_VERSION);
  });

  it("is the newest entry in the API changelog", () => {
    const changelog = read("_developer/flutter/_changelog.md");
    const newest = changelog.match(/^## (\d+\.\d+\.\d+)\b/m)?.[1];
    expect(newest).toBe(API_VERSION);
  });

  it("matches the newest release in CHANGELOG.md", () => {
    const changelog = read("CHANGELOG.md");
    const released = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map(
      (m) => m[1],
    );
    if (released.length > 0) {
      expect(released[0]).toBe(APP_VERSION);
    } else {
      // No release has been tagged yet — everything ships under [Unreleased].
      // The moment the first version heading is cut, the branch above takes
      // over and holds package.json to it.
      expect(changelog).toMatch(/^## \[Unreleased\]/m);
    }
  });
});
