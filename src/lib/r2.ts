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
function getClient(cfg: R2Config): AwsClient {
  const key = `${cfg.accessKeyId}:${cfg.secretAccessKey}`;
  if (client && clientKey === key) return client;
  client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
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

/** Best-effort delete (signed DELETE). Never throws — a stale object is harmless. */
export async function deleteObject(key: string): Promise<void> {
  const cfg = readConfig();
  if (!cfg) return;
  try {
    const res = await getClient(cfg).fetch(objectUrl(cfg, key), { method: "DELETE" });
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
 */
export async function signedGetUrl(
  key: string,
  opts: { expiresSeconds: number; disposition?: string } = { expiresSeconds: 300 },
): Promise<string> {
  const cfg = requireConfig();
  const url = new URL(objectUrl(cfg, key));
  url.searchParams.set("X-Amz-Expires", String(opts.expiresSeconds));
  if (opts.disposition) {
    url.searchParams.set("response-content-disposition", opts.disposition);
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
