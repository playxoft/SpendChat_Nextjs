/**
 * The one-time "send invites" intent: the only thing that lets
 * `/app/split/import` create a group and invite people without a click there.
 *
 * Recorded when — and only when — the visitor presses the calculator's
 * explicit "Send invites" or "Share with the group" prompt and goes on to sign
 * up or in. It names the exact draft (`draftHash`) and when, and it's good for
 * `SPLIT_SEND_INTENT_TTL_MS`: a draft edited since, a link opened later, an old
 * draft found weeks on, or a "Save" click all lack one, and the page shows a
 * button instead.
 *
 * Claiming it is compare-and-delete: read it, check it's fresh and for this
 * draft, remove it, in one step. In the browser that step runs inside a Web
 * Lock (`navigator.locks`), which is exclusive across every tab of the origin,
 * so when two tabs open the import page only one claims it; the other sees it
 * gone. Where Web Locks are missing, the step still runs in one synchronous
 * turn, and the server's idempotency key is the backstop either way.
 *
 * Pure apart from the `Storage` it's handed — tests pass a fake.
 */

export const SPLIT_SEND_INTENT_KEY = "spendchat:tools:split:send-intent";
/** How long an intent stays good: long enough to sign up and verify an email. */
export const SPLIT_SEND_INTENT_TTL_MS = 30 * 60 * 1000;
/** The Web Lock that makes claiming atomic across tabs. */
export const SPLIT_SEND_INTENT_LOCK = "spendchat-split-send-intent";

/**
 * Set while an import request is out, so a reload mid-request doesn't start
 * it again blind: the page shows the form with "check your groups" instead.
 */
export const SPLIT_IMPORTING_KEY = "spendchat:tools:split:importing";
/** After this long an "importing" marker is from a request that's long over. */
export const SPLIT_IMPORTING_TTL_MS = 10 * 60 * 1000;

type KeyValue = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Stamp = { draftHash: string; at: number };

function read(storage: KeyValue, key: string): Stamp | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (typeof v !== "object" || v === null) return null;
    const { draftHash, at } = v as Record<string, unknown>;
    return typeof draftHash === "string" && typeof at === "number" && Number.isFinite(at) ? { draftHash, at } : null;
  } catch {
    return null;
  }
}

function write(storage: KeyValue, key: string, stamp: Stamp): void {
  try {
    storage.setItem(key, JSON.stringify(stamp));
  } catch {
    // Storage blocked: no intent is recorded, so the page will ask — the safe side.
  }
}

function remove(storage: KeyValue, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}

const fresh = (stamp: Stamp, now: number, ttl: number) => stamp.at <= now && now - stamp.at <= ttl;

/** Record the intent to send invites for the draft with this hash. Replaces any earlier one. */
export function recordSendIntent(storage: KeyValue, draftHash: string, now: number): void {
  write(storage, SPLIT_SEND_INTENT_KEY, { draftHash, at: now });
}

/**
 * Claim the intent for this draft: `true` only if one is stored, fresh and for
 * exactly this draft — and then it's gone, so the next claim is `false`. A
 * stale or unreadable one is removed too; one for another draft is left alone.
 */
export function claimSendIntent(storage: KeyValue, draftHash: string, now: number): boolean {
  const stamp = read(storage, SPLIT_SEND_INTENT_KEY);
  if (!stamp) {
    remove(storage, SPLIT_SEND_INTENT_KEY);
    return false;
  }
  if (!fresh(stamp, now, SPLIT_SEND_INTENT_TTL_MS)) {
    remove(storage, SPLIT_SEND_INTENT_KEY);
    return false;
  }
  if (stamp.draftHash !== draftHash) return false;
  remove(storage, SPLIT_SEND_INTENT_KEY);
  return true;
}

/** Mark an import of this draft as in flight (before the request goes out). */
export function markImporting(storage: KeyValue, draftHash: string, now: number): void {
  write(storage, SPLIT_IMPORTING_KEY, { draftHash, at: now });
}

/** The request came back (either way): the marker goes. */
export function clearImporting(storage: KeyValue): void {
  remove(storage, SPLIT_IMPORTING_KEY);
}

/**
 * Whether an import of this draft may already be in flight or done — a
 * recent marker that was never cleared, i.e. the page was reloaded or closed
 * mid-request. An old marker is dropped.
 */
export function maybeImported(storage: KeyValue, draftHash: string, now: number): boolean {
  const stamp = read(storage, SPLIT_IMPORTING_KEY);
  if (!stamp) return false;
  if (!fresh(stamp, now, SPLIT_IMPORTING_TTL_MS)) {
    remove(storage, SPLIT_IMPORTING_KEY);
    return false;
  }
  return stamp.draftHash === draftHash;
}
