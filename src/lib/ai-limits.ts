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
