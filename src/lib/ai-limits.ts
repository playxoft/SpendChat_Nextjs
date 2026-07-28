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
