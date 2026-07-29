/**
 * Limits shared by the AI-entry client and server. Kept out of `ai-parse.ts`
 * because that module is `server-only` (it holds the provider keys' code path),
 * and the composer needs the input cap to stop a note *before* a round-trip.
 * The server still enforces both — this file only lets the client agree.
 */

/** Longest note the parser accepts, in characters. */
export const MAX_INPUT_CHARS = 2000;

/** Most drafts a single parse may return. */
export const MAX_DRAFTS = 50;

/**
 * Longest single voice recording, in milliseconds. The recorder stops itself
 * here even if the key is still held — an open mic that never ends would upload
 * an unbounded blob and bill for it. A minute is far longer than "200 fruits,
 * 100 veg, 1000 electricity" ever needs.
 */
export const MAX_RECORDING_MS = 60_000;

/**
 * Largest audio payload the transcribe action accepts, in bytes of *raw* audio
 * (before base64). Opus in WebM runs ~4 KB/s, so a minute is well under 1 MB;
 * 4 MB leaves room for browsers that fall back to a fatter codec while still
 * refusing anything that could only be a hand-crafted request.
 */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * Longest transcript we keep from one recording. A minute of speech is ~150
 * words (~900 chars); this caps a runaway/looping model response well before
 * `MAX_INPUT_CHARS` so the text still fits the composer with room to edit.
 */
export const MAX_TRANSCRIPT_CHARS = 1200;
