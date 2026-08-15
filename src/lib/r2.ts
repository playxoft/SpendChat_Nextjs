import "server-only";
import { AwsClient } from "aws4fetch";
import { describeError, logger } from "@/lib/logger";

/**
 * Cloudflare R2 object storage via its S3-compatible API — used to store user
 * avatars. We sign requests with `aws4fetch` (a ~3 KB SigV4 signer built on Web
 * Crypto) rather than the AWS SDK, so the same code runs in the Cloudflare
 * Worker (where the SDK is far too heavy) and in local dev / tests.
 *
 * Configuration (managed in Doppler — all optional; uploads are refused with a
 * clear error when unset, so local dev and tests need nothing):
 *   R2_ACCOUNT_ID        – Cloudflare account id (the S3 endpoint host prefix)
 *   R2_ACCESS_KEY_ID     – an R2 API token's access key id
 *   R2_SECRET_ACCESS_KEY – the matching secret
 *   R2_BUCKET            – bucket name, e.g. "spendchat-avatars"
 *   R2_PUBLIC_BASE_URL   – public serving base (a custom domain or the bucket's
 *                          pub-*.r2.dev URL); the stored image URL is
 *                          `${R2_PUBLIC_BASE_URL}/${key}`
 *
 * Like `email.ts`, config is read from `process.env` (Doppler in dev, the
 * Worker's bindings in prod), lazily, so nothing is captured at build time.
 */

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    // Tolerate a bare hostname in the env ("r2-bucket.spendchat.app"): default to
    // https:// when no scheme is given, and drop any trailing slash — so the
    // stored `${base}/${key}` is always an absolute URL (mirrors `site.ts`).
    publicBaseUrl: publicBaseUrl
      .replace(/^(?!https?:\/\/)/i, "https://")
      .replace(/\/$/, ""),
  };
}

function requireConfig(): R2Config {
  const cfg = readConfig();
  if (!cfg) throw new Error("R2 is not configured (set R2_* env vars)");
  return cfg;
}

/** True when every R2 env var is present — callers gate uploads on this. */
export function isR2Configured(): boolean {
  return readConfig() !== null;
}

// Cache the signer across calls, re-created only if the credentials change.
let client: AwsClient | null = null;
let clientKey = "";
function getClient(cfg: R2Config, retries?: number): AwsClient {
  const key = `${cfg.accessKeyId}:${cfg.secretAccessKey}:${retries ?? ""}`;
  if (client && clientKey === key) return client;
  client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
    ...(retries != null ? { retries } : {}),
  });
  clientKey = key;
  return client;
}

/**
 * The S3-API URL for an object key. Keys we mint contain only `[a-z0-9/-]`
 * (`avatars/<uuid>/<uuid>`), so no path-segment escaping is needed.
 */
function objectUrl(cfg: R2Config, key: string): string {
  return `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key}`;
}

/** Store an object (signed PUT). Throws on a non-2xx response. */
export async function uploadObject(
  key: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const cfg = requireConfig();
  const res = await getClient(cfg).fetch(objectUrl(cfg, key), {
    method: "PUT",
    body,
    headers: {
      "content-type": contentType,
      // R2's S3 API rejects a PUT without Content-Length (411 MissingContentLength).
      // Next's fetch wrapper drops the implicit length undici would add for a
      // fixed-size body, so set it explicitly from the known byte length.
      "content-length": String(body.byteLength),
      // A year of immutable caching — keys are content-addressed (a fresh uuid
      // per upload), so the URL changes whenever the image does.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    throw new Error(`R2 PUT ${key} failed with status ${res.status}: ${detail}`);
  }
}

/** One signed DELETE through a given signer. Never throws. */
async function deleteOne(cfg: R2Config, key: string, signer: AwsClient): Promise<void> {
  try {
    const res = await signer.fetch(objectUrl(cfg, key), { method: "DELETE" });
    // 204 = deleted, 404 = already gone; anything else is worth a warning.
    if (!res.ok && res.status !== 404) {
      logger.warn(`R2 delete of ${key} returned status ${res.status}`, {
        event: "r2.delete_failed",
        status: res.status,
      });
    }
  } catch (err) {
    logger.warn(`R2 delete of ${key} failed: ${describeError(err)}`, {
      event: "r2.delete_failed",
      error: err,
    });
  }
}

/** Best-effort delete (signed DELETE). Never throws — a stale object is harmless. */
export async function deleteObject(key: string): Promise<void> {
  const cfg = readConfig();
  if (!cfg) return;
  return deleteOne(cfg, key, getClient(cfg));
}

/** Keys S3's multi-object delete accepts per call — its documented maximum. */
const DELETE_BATCH_SIZE = 1000;

/**
 * How many objects `deleteObjects` will fall back to deleting one at a time
 * when a batch call fails. Cloudflare allows 50 subrequests per request on the
 * free plan and 1000 on paid, so an unbounded key-by-key retry of a large sweep
 * is the same flood the batch exists to avoid: past the ceiling every fetch
 * throws, the objects stay in the bucket anyway, and the request that was only
 * cleaning up dies with them. Whatever the budget doesn't cover is logged.
 */
const MAX_INDIVIDUAL_FALLBACK = 100;

/**
 * aws4fetch retries a 5xx/429 ten times by default, with backoff. That's right
 * for a single user-facing upload and wrong for a sweep: every attempt is
 * another subrequest, so one bucket outage during a large delete turns the
 * bounded budget above into eleven times as many calls (and minutes of
 * waiting) for objects that are already unreachable. Sweeping gets one retry.
 */
const SWEEP_RETRIES = 1;

/** Escape a key for the delete request's XML body. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sha256Hex(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * One `POST /?delete` for up to `DELETE_BATCH_SIZE` keys. Returns false when
 * the call itself failed, so the caller can retry those keys individually;
 * per-key failures inside a 200 are logged and not retried (they're reported
 * with a reason and are almost always "already gone").
 */
async function deleteBatch(cfg: R2Config, keys: string[], signer: AwsClient): Promise<boolean> {
  const body =
    '<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>true</Quiet>' +
    keys.map((k) => `<Object><Key>${xmlEscape(k)}</Key></Object>`).join("") +
    "</Delete>";
  try {
    const res = await signer.fetch(
      `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}?delete`,
      {
        method: "POST",
        body,
        headers: {
          "content-type": "application/xml",
          // Same reason as the PUT above: Next's fetch drops the implicit length.
          "content-length": String(new TextEncoder().encode(body).byteLength),
          // aws4fetch signs S3 requests with UNSIGNED-PAYLOAD by default. This
          // is the one call whose body *names the objects to destroy*, so it is
          // signed — an unsigned list of keys is a tampering target, and some
          // S3 implementations reject a multi-object delete without integrity
          // coverage outright.
          "x-amz-content-sha256": await sha256Hex(body),
        },
      },
    );
    if (!res.ok) {
      logger.warn(`R2 batch delete of ${keys.length} objects returned status ${res.status}`, {
        event: "r2.delete_batch_failed",
        status: res.status,
        objects: keys.length,
      });
      return false;
    }
    // `<Quiet>` suppresses the per-key success entries, so anything the result
    // still names is a key that survived.
    const failed = ((await res.text().catch(() => "")).match(/<Error>/g) ?? []).length;
    if (failed > 0) {
      logger.warn(`R2 batch delete left ${failed} of ${keys.length} objects in the bucket`, {
        event: "r2.delete_batch_partial",
        failed,
        objects: keys.length,
      });
    }
    return true;
  } catch (err) {
    logger.warn(`R2 batch delete of ${keys.length} objects failed: ${describeError(err)}`, {
      event: "r2.delete_batch_failed",
      objects: keys.length,
      error: err,
    });
    return false;
  }
}

/**
 * Best-effort delete of many objects at once. Never throws.
 *
 * Sweeping a deleted profile or folder one signed DELETE at a time is what
 * makes a large delete fail: hundreds of sequential round-trips blow both the
 * Workers subrequest ceiling and the request's time budget, so the caller gets
 * an error for a delete that already committed and the objects are stranded in
 * the bucket with nothing left in the database pointing at them. The batch API
 * turns 1600 round-trips into two.
 *
 * Null/empty keys are ignored and duplicates collapsed, so callers can pass
 * `[r2Key, thumbnailKey]` pairs straight through.
 */
export async function deleteObjects(keys: readonly (string | null | undefined)[]): Promise<void> {
  const cfg = readConfig();
  if (!cfg) return;
  const unique = [...new Set(keys.filter((k): k is string => !!k))];
  if (unique.length === 0) return;
  const signer = getClient(cfg, SWEEP_RETRIES);
  if (unique.length === 1) return deleteOne(cfg, unique[0]!, signer);

  let budget = MAX_INDIVIDUAL_FALLBACK;
  for (let i = 0; i < unique.length; i += DELETE_BATCH_SIZE) {
    const batch = unique.slice(i, i + DELETE_BATCH_SIZE);
    if (await deleteBatch(cfg, batch, signer)) continue;
    const retried = batch.slice(0, budget);
    budget -= retried.length;
    for (const key of retried) await deleteOne(cfg, key, signer);
    const stranded = batch.length - retried.length;
    if (stranded > 0) {
      logger.warn(`R2 left ${stranded} objects in the bucket after a batch delete failed`, {
        event: "r2.delete_stranded",
        stranded,
      });
    }
  }
}

/**
 * A short-lived **presigned GET URL** for a private object, signed with SigV4
 * query auth (`aws4fetch` `signQuery`). Unlike `avatarPublicUrl`, this never
 * touches the bucket's public base — it points straight at the S3 API endpoint
 * and is authorized by the signature alone, so it works regardless of whether
 * the bucket serves anything publicly. Used to serve transaction attachments,
 * which are private financial documents: the app authorizes the caller (RBAC)
 * and only then mints a URL that expires in minutes.
 *
 * `disposition` sets the `response-content-disposition` override (S3 lets a GET
 * request restate the header), so we can hand back the original filename and
 * choose inline preview vs. download without proxying the bytes through the
 * Worker.
 *
 * `contentType` overrides `response-content-type` the same way, and callers
 * serving a stored file should always pass it: the object's own type is
 * whatever it was PUT with, so anything uploaded before we could name its
 * container is `application/octet-stream` in the bucket forever. On this path
 * the browser sees the object's header, not ours — without the override a
 * corrected type never reaches the player and the video still downloads.
 * Both overrides are signed query parameters, so neither can be tampered with
 * after the URL is minted.
 */
export async function signedGetUrl(
  key: string,
  opts: { expiresSeconds: number; disposition?: string; contentType?: string } = {
    expiresSeconds: 300,
  },
): Promise<string> {
  const cfg = requireConfig();
  const url = new URL(objectUrl(cfg, key));
  url.searchParams.set("X-Amz-Expires", String(opts.expiresSeconds));
  if (opts.disposition) {
    url.searchParams.set("response-content-disposition", opts.disposition);
  }
  if (opts.contentType) {
    url.searchParams.set("response-content-type", opts.contentType);
  }
  const signed = await getClient(cfg).sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

/** Public URL an object is served from (what we persist in `users.image`). */
export function avatarPublicUrl(key: string): string {
  return `${requireConfig().publicBaseUrl}/${key}`;
}

/**
 * The object key behind a public URL we minted, or null if the URL isn't one of
 * ours (e.g. a Google avatar seeded at sign-in) — so we only ever delete objects
 * that live in our bucket.
 */
export function keyFromPublicUrl(url: string): string | null {
  const cfg = readConfig();
  if (!cfg) return null;
  const prefix = `${cfg.publicBaseUrl}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}
