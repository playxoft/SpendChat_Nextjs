"use client";

import { draftHash, type SplitDraft } from "@/lib/tools/split-bill";
import {
  claimSendIntent,
  clearImporting,
  markImporting,
  maybeImported,
  recordSendIntent,
  SPLIT_SEND_INTENT_LOCK,
} from "@/lib/tools/split-send-intent";
import { setDraft } from "./draft-store";

/**
 * The browser side of `lib/tools/split-send-intent.ts`: the same rules over
 * `localStorage`, with claiming done inside a Web Lock so only one tab ever
 * gets a given intent.
 */

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The visitor pressed "Send invites" / "Share with the group" and is going to
 * sign up or in. The draft is saved first, so the hash names exactly what the
 * import page will read back.
 */
export function recordSendIntentFor(draft: SplitDraft): void {
  setDraft(draft, { immediate: true });
  const s = storage();
  if (s) recordSendIntent(s, draftHash(draft), Date.now());
}

/** One claim per draft per page load, shared — Strict Mode runs an effect twice. */
const claims = new Map<string, Promise<boolean>>();

/** Claim this draft's intent (see `claimSendIntent`): `true` once, in one tab. */
export function claimSendIntentFor(draft: SplitDraft): Promise<boolean> {
  const hash = draftHash(draft);
  const pending = claims.get(hash);
  if (pending) return pending;
  const s = storage();
  const claim = () => (s ? claimSendIntent(s, hash, Date.now()) : false);
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  const result = (locks ? locks.request(SPLIT_SEND_INTENT_LOCK, claim) : Promise.resolve(claim())).catch(
    () => false,
  );
  claims.set(hash, result);
  void result.finally(() => claims.delete(hash));
  return result;
}

export function markImportingFor(draft: SplitDraft): void {
  const s = storage();
  if (s) markImporting(s, draftHash(draft), Date.now());
}

export function clearImportingMarker(): void {
  const s = storage();
  if (s) clearImporting(s);
}

/** A reload (or a closed tab) left an import of this draft unfinished — it may have gone through. */
export function mayAlreadyBeImported(draft: SplitDraft): boolean {
  const s = storage();
  return s ? maybeImported(s, draftHash(draft), Date.now()) : false;
}
