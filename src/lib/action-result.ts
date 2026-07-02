import { ApiError } from "@/lib/errors";

/**
 * Bridges the shared service layer to the web server actions. Services throw
 * `ApiError` for validation/business-rule failures; actions historically
 * return `{ ok: false, error }`. `runAction` runs the service call and converts
 * an `ApiError` into that shape, while letting anything else (notably Next's
 * `redirect()` control-flow error) propagate untouched.
 */
export type ActionOk<T> = { ok: true } & T;
export type ActionResult<T = Record<never, never>> = ActionOk<T> | { ok: false; error: string };

export async function runAction<T extends object = Record<never, never>>(
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const extra = await fn();
    return { ok: true, ...extra };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    throw err;
  }
}
