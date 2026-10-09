import { VOICE } from "@/lib/plans";

/**
 * Limits shared by the AI-entry client and server. Kept out of `ai-parse.ts`
 * because that module is `server-only` (it holds the provider keys' code path),
 * and the composer needs the input cap to stop a note *before* a round-trip.
 * The server still enforces both — this file only lets the client agree.
 *
 * Client-safe: the only import is `plans.ts`, which is pure.
 */

/**
 * Longest note the parser accepts, in characters. Sized so a full two-minute
 * transcript (`MAX_TRANSCRIPT_CHARS`) still fits in the composer with room to
 * add a line or fix a misheard word before sending. Cost is set by the drafts
 * that come back (capped at `MAX_DRAFTS`), not by the note's length, so the
 * extra headroom is cheap.
 */
export const MAX_INPUT_CHARS = 3000;

/** Most drafts a single parse may return. */
export const MAX_DRAFTS = 50;

/**
 * Longest single voice recording, in milliseconds — the plan catalogue's clip
 * cap (`VOICE.maxClipMs`, two minutes). The recorder stops itself here even if
 * the key is still held: an open mic that never ends would upload an unbounded
 * blob and bill for it. Each started minute is one AI action
 * (`voiceActionsFor`), so a full-length clip costs two.
 */
export const MAX_RECORDING_MS = VOICE.maxClipMs;

/**
 * Largest audio payload the transcribe endpoints accept, in bytes of *raw*
 * audio (before any encoding). The web recorder pins Opus at 32 kbps, so a
 * full two-minute clip is ~480 KB; 4 MB is two minutes at ~270 kbps, which
 * covers Safari's AAC path (it may ignore the bitrate hint) and mobile
 * recorders at 128–256 kbps, while refusing anything that could only be a
 * hand-crafted request. The server can't trust a client's declared duration,
 * so this is also what bounds a lying client: at most this much audio reaches
 * the provider per call, whatever it claimed. Stays under the server-action
 * body ceiling (`serverActions.bodySizeLimit`, 5 MB) so the friendly error wins.
 */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * Longest transcript we keep from one recording. Two minutes of speech is
 * ~300 words (~1,800 chars); this caps a runaway/looping model response with
 * some headroom for fast talkers, and stays well under `MAX_INPUT_CHARS` so the
 * text still fits the composer with room to edit.
 */
export const MAX_TRANSCRIPT_CHARS = 2400;

/**
 * The workspace's AI actions left this month, for the "38 of 50 AI actions
 * left this month" line on the composers. Pages stream it from
 * `getAiAllowance`; every charged action returns a fresh one, read under the
 * charge's own locks, so the line moves after each use without another query.
 */
export type AiActionsLeft = {
  remaining: number;
  limit: number;
  /** Top-up actions left (C4), spent once `remaining` is 0. Absent = none. */
  topUpRemaining?: number;
  /** When the allowance refills (ISO) — known from the page load, not from an action. */
  resetsAt?: string;
};

/**
 * Is the workspace out of AI actions — the month's allowance **and** every
 * top-up (C4)? A spent allowance with top-ups left is not spent: they carry on.
 */
export function aiActionsSpent(left: AiActionsLeft | null | undefined): boolean {
  return Boolean(left) && left!.remaining <= 0 && (left!.topUpRemaining ?? 0) <= 0;
}

/**
 * Why Ask has no composer for a viewer, and the 403 a direct call gets. Ask
 * spends the workspace's shared AI actions, so — like the composer's AI mode —
 * it needs edit access; a read-only member can't drain the allowance.
 */
export const ASK_NEEDS_EDIT_MESSAGE =
  "SpendChat AI uses the workspace's AI actions — ask an admin for edit access.";
