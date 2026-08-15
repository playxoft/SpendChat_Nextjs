import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { signedGetUrl } from "@/lib/r2";

/**
 * The presigned GET URL a browser or the Flutter app is redirected to. What
 * matters here is that the response overrides ride along *inside* the
 * signature: the object in the bucket keeps whatever `Content-Type` it was
 * uploaded with, so a file stored before its container could be named is
 * `application/octet-stream` there forever, and only the override makes the
 * player see a video. If the override weren't signed it could also be swapped
 * by whoever holds the link.
 */

const ENV = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "akid",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
  R2_PUBLIC_BASE_URL: "https://files.example",
};

const KEY = "vault/ws/profile/file.bin";

beforeEach(() => {
  Object.assign(process.env, ENV);
  // Freeze the clock: SigV4 mixes the timestamp into the signature, so two
  // calls a second apart would differ for a reason this test isn't about.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-15T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  for (const key of Object.keys(ENV)) delete process.env[key as keyof typeof ENV];
});

describe("signedGetUrl", () => {
  it("carries the content-type and disposition overrides", async () => {
    const url = new URL(
      await signedGetUrl(KEY, {
        expiresSeconds: 300,
        disposition: `inline; filename="holiday.mkv"`,
        contentType: "video/x-matroska",
      }),
    );
    expect(url.searchParams.get("response-content-type")).toBe("video/x-matroska");
    expect(url.searchParams.get("response-content-disposition")).toMatch(/^inline; /);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signs the overrides, so neither can be swapped after the URL is minted", async () => {
    const sign = async (contentType?: string) =>
      new URL(await signedGetUrl(KEY, { expiresSeconds: 300, contentType })).searchParams.get(
        "X-Amz-Signature",
      );

    const matroska = await sign("video/x-matroska");
    expect(await sign("video/x-matroska")).toBe(matroska);
    expect(await sign("text/html")).not.toBe(matroska);
    expect(await sign()).not.toBe(matroska);
  });

  it("omits the override when no type is given (a preview keeps its own)", async () => {
    const url = new URL(await signedGetUrl(KEY, { expiresSeconds: 60 }));
    expect(url.searchParams.has("response-content-type")).toBe(false);
    expect(url.searchParams.has("response-content-disposition")).toBe(false);
  });
});
