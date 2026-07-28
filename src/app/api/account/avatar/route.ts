import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setLogContext } from "@/lib/log-context";
import { withRequestContext } from "@/lib/request-context";
import { describeError, logger } from "@/lib/logger";
import {
  avatarPublicUrl,
  deleteObject,
  isR2Configured,
  keyFromPublicUrl,
  uploadObject,
} from "@/lib/r2";
import { setUserImage } from "@/services/settings";

export const dynamic = "force-dynamic";

/** Max upload size. The client resizes to ≤512px first, so this is a safety cap. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Accepted image types → the extension we store the object under. */
const ALLOWED_TYPES = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

/**
 * CSRF guard: a mutation authenticated by the ambient session cookie must reject
 * cross-site callers (Next server actions get this for free; route handlers
 * don't). Browsers send `Sec-Fetch-Site` on every fetch and `Origin` on POSTs;
 * a request with neither comes from a non-browser client carrying no cookies.
 */
function isCrossSite(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.headers.get("host");
  } catch {
    return true;
  }
}

/**
 * Avatar upload/remove for the signed-in user. Not part of the versioned mobile
 * API (`/api/v1`), so it carries no OpenAPI/changelog contract.
 *
 * POST — multipart `file` (PNG/JPEG/WebP, ≤2 MB): store it in R2 and point
 * `users.image` at the public URL, best-effort deleting the object it replaces.
 * DELETE — clear `users.image` and best-effort delete the object.
 */
export async function POST(request: NextRequest) {
  return withRequestContext("web", async () => {
    if (isCrossSite(request)) {
      return Response.json({ error: "Cross-site request rejected" }, { status: 403 });
    }
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    setLogContext({ userId: user.id });

    if (!isR2Configured()) {
      return Response.json(
        { error: "Image uploads aren't configured on this server." },
        { status: 503 },
      );
    }

    let file: File | null = null;
    try {
      const value = (await request.formData()).get("file");
      if (value instanceof File) file = value;
    } catch {
      // malformed body → falls through to the missing-file response
    }
    if (!file) return Response.json({ error: "No image was provided." }, { status: 400 });

    const ext = ALLOWED_TYPES.get(file.type);
    if (!ext) {
      return Response.json(
        { error: "Unsupported image type — use PNG, JPEG, or WebP." },
        { status: 415 },
      );
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return Response.json({ error: "Image must be 2 MB or smaller." }, { status: 413 });
    }

    const key = `avatars/${user.id}/${crypto.randomUUID()}.${ext}`;
    try {
      await uploadObject(key, await file.arrayBuffer(), file.type);
    } catch (err) {
      logger.error(`Avatar upload to R2 failed: ${describeError(err)}`, {
        event: "account.avatar_upload_failed",
        userId: user.id,
        error: err,
      });
      return Response.json({ error: "Upload failed. Please try again." }, { status: 502 });
    }

    const url = avatarPublicUrl(key);
    const { previousUrl } = await setUserImage(user.id, url);
    if (previousUrl) {
      const oldKey = keyFromPublicUrl(previousUrl);
      if (oldKey && oldKey !== key) await deleteObject(oldKey);
    }
    return Response.json({ url });
  });
}

export async function DELETE(request: NextRequest) {
  return withRequestContext("web", async () => {
    if (isCrossSite(request)) {
      return Response.json({ error: "Cross-site request rejected" }, { status: 403 });
    }
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    setLogContext({ userId: user.id });

    const { previousUrl } = await setUserImage(user.id, null);
    if (previousUrl) {
      const oldKey = keyFromPublicUrl(previousUrl);
      if (oldKey) await deleteObject(oldKey);
    }
    return Response.json({ ok: true });
  });
}
