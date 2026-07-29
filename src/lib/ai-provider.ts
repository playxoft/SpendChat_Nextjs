import "server-only";
import { ApiError } from "@/lib/errors";
import { describeError, logger } from "@/lib/logger";

/**
 * The AI transport layer: the shared config/error vocabulary plus one generic
 * adapter per API protocol, for both text completion (`callProvider`) and
 * speech-to-text (`transcribeProvider`). **No model ids and no curated model
 * list live here** — only the request/response shape of each protocol. Which
 * model runs is resolved from the environment by `ai-model-registry.ts`.
 *
 * Split out from `ai-parse.ts` so the pure parsing/validation there stays under
 * the coverage gate while this `fetch` wiring is excluded like the other I/O
 * modules (`logger.ts`, `email.ts`) — see vitest.config.ts.
 */

export type Provider = "gemini" | "openai" | "anthropic";

export const PROVIDERS = new Set<Provider>(["gemini", "openai", "anthropic"]);

export type ModelConfig = {
  provider: Provider;
  model: string;
  apiKey: string;
  baseUrl?: string;
};

/**
 * Output budget. Sized against `MAX_DRAFTS` (50) — each draft serializes to
 * roughly 45 tokens, so 50 rows plus the envelope needs ~2.5k. A budget that
 * can't hold the reply truncates the JSON mid-object, and a truncated object is
 * unrecoverable (the `{…}`-span salvage in `parseLoose` yields unbalanced JSON),
 * which would surface to the user as a bogus "couldn't reach the AI".
 */
const MAX_OUTPUT_TOKENS = 4096;

/** Every adapter pins this: the same note must split the same way twice. */
const TEMPERATURE = 0;

const REQUEST_TIMEOUT_MS = 20_000;

// Transcription is heavier than a text completion: it uploads the audio and the
// model processes up to a minute of speech, so it gets a longer ceiling than the
// 20s parse budget. Still bounded, so a stalled provider can't hang the request.
const TRANSCRIBE_TIMEOUT_MS = 45_000;

/** Config missing / misconfigured — user-facing, distinct from an upstream failure. */
export function aiUnavailable(): ApiError {
  return new ApiError(503, "ai_unavailable", "AI-assisted input isn't available right now.");
}

/** The provider was reached but the request failed or returned garbage. */
export function aiFailed(): ApiError {
  return new ApiError(502, "ai_failed", "Couldn't reach the AI just now — please try again.");
}

// Gemini responseSchema (OpenAPI subset: uppercase types, `nullable`).
const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    transactions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", enum: ["income", "expense"] },
          amount: { type: "NUMBER" },
          title: { type: "STRING" },
          description: { type: "STRING", nullable: true },
          categoryName: { type: "STRING", nullable: true },
          occurredOn: { type: "STRING" },
        },
        required: ["type", "amount", "title", "occurredOn"],
      },
    },
  },
  required: ["transactions"],
} as const;

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};
type OpenAiResponse = {
  choices?: Array<{
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string;
  }>;
};
type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
  stop_reason?: string;
};

/** Which caller a request belongs to — names the log event, nothing more. */
type Feature = "parse" | "transcribe";

/**
 * POST and read the body, with one timeout covering **both**. Aborting only
 * around `fetch` would leave the body read unbounded — `fetch` resolves as soon
 * as the headers land, so a provider that stalls mid-body would hang the request
 * until the platform killed it.
 *
 * `body` is either a JSON-serializable value (sent as `application/json`) or a
 * `FormData` (sent as multipart, letting `fetch` set the boundary itself).
 */
async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  provider: Provider,
  feature: Feature = "parse",
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const multipart = body instanceof FormData;
  try {
    const res = await fetch(url, {
      method: "POST",
      // Never set Content-Type for FormData — `fetch` appends the multipart
      // boundary, and an explicit header would clobber it and break the parse.
      headers: multipart ? headers : { "Content-Type": "application/json", ...headers },
      body: multipart ? body : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.error(`AI ${feature} request failed with status ${res.status}`, {
        event: `ai.${feature}.http_error`,
        provider,
        status: res.status,
        // Only the provider's machine-readable error code. Their free-text
        // `message` is off-limits: it echoes request fragments (the user's note)
        // and, on an auth failure, a partial API key.
        ...(await errorCode(res)),
      });
      throw aiFailed();
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The provider's error code/type from a failed response, never its message.
 * Falls back to the body's size so a non-JSON error is still diagnosable.
 */
async function errorCode(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: unknown; type?: unknown; status?: unknown } };
    const e = parsed.error;
    if (e && typeof e === "object") {
      return {
        errorCode: typeof e.code === "string" || typeof e.code === "number" ? e.code : null,
        errorType: typeof e.type === "string" ? e.type : null,
        errorStatus: typeof e.status === "string" ? e.status : null,
      };
    }
  } catch {
    /* not JSON — fall through to the size */
  }
  return { bodyChars: raw.length };
}

function noContent(
  provider: Provider,
  feature: Feature,
  meta: Record<string, unknown> = {},
): never {
  logger.error(`AI ${feature} returned no content`, {
    event: `ai.${feature}.empty_response`,
    provider,
    ...meta,
  });
  throw aiFailed();
}

async function callGemini(cfg: ModelConfig, system: string, userText: string): Promise<string> {
  const base = cfg.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const json = (await post(
    `${base.replace(/\/$/, "")}/models/${cfg.model}:generateContent`,
    { "x-goog-api-key": cfg.apiKey },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_SCHEMA,
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // On the 2.5 thinking models, reasoning tokens are drawn from
        // maxOutputTokens — leaving it on means a short note can burn the whole
        // budget and come back with zero content parts. This is extraction, not
        // reasoning, so spend the budget on the answer.
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
    "gemini",
  )) as GeminiResponse;

  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    // `finishReason` separates "hit the token ceiling" from "was blocked" — the
    // two need different fixes and both otherwise look like a generic failure.
    noContent("gemini", "parse", {
      finishReason: candidate?.finishReason ?? null,
      blockReason: json.promptFeedback?.blockReason ?? null,
    });
  }
  return text;
}

async function callOpenAI(cfg: ModelConfig, system: string, userText: string): Promise<string> {
  // OpenAI Chat-Completions shape — also serves DeepSeek / Llama hosts / any
  // OpenAI-compatible endpoint via cfg.baseUrl. `json_object` mode is the most
  // portable structured output across those providers; the exact shape is
  // pinned by the system prompt and re-validated in `draftsFromRawJson`.
  const base = cfg.baseUrl || "https://api.openai.com/v1";
  const json = (await post(
    `${base.replace(/\/$/, "")}/chat/completions`,
    { Authorization: `Bearer ${cfg.apiKey}` },
    {
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
      response_format: { type: "json_object" },
      temperature: TEMPERATURE,
      // `max_tokens`, not `max_completion_tokens`: this adapter also fronts
      // DeepSeek / Llama hosts / anything OpenAI-compatible, and `max_tokens` is
      // the parameter they all accept. (OpenAI's own reasoning models — o1, o3 —
      // reject both this and `temperature`, and want a `developer` role rather
      // than `system`; they aren't usable through this adapter. See .env.example.)
      max_tokens: MAX_OUTPUT_TOKENS,
    },
    "openai",
  )) as OpenAiResponse;

  const choice = json.choices?.[0];
  const message = choice?.message;
  if (message?.refusal || typeof message?.content !== "string" || !message.content.trim()) {
    noContent("openai", "parse", {
      refused: Boolean(message?.refusal),
      finishReason: choice?.finish_reason ?? null,
    });
  }
  return message.content;
}

async function callAnthropic(cfg: ModelConfig, system: string, userText: string): Promise<string> {
  const base = cfg.baseUrl || "https://api.anthropic.com/v1";
  const json = (await post(
    `${base.replace(/\/$/, "")}/messages`,
    { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
    {
      model: cfg.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      system,
      messages: [{ role: "user", content: userText }],
    },
    "anthropic",
  )) as AnthropicResponse;

  const text = (json.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) noContent("anthropic", "parse", { stopReason: json.stop_reason ?? null });
  return text;
}

/** Dispatch to the adapter for this config's protocol, normalizing failures. */
export async function callProvider(
  cfg: ModelConfig,
  system: string,
  userText: string,
): Promise<string> {
  try {
    switch (cfg.provider) {
      case "openai":
        return await callOpenAI(cfg, system, userText);
      case "anthropic":
        return await callAnthropic(cfg, system, userText);
      case "gemini":
        return await callGemini(cfg, system, userText);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error(`AI parse request errored: ${describeError(err)}`, {
      event: "ai.parse.error",
      provider: cfg.provider,
      error: err,
    });
    throw aiFailed();
  }
}

// ── Speech to text ──────────────────────────────────────────────────────────
// A voice note recorded in the browser, uploaded for transcription. `data` is
// base64 (the wire format for a server action) and `mimeType` is whatever
// MediaRecorder produced — usually audio/webm, audio/mp4 on Safari.

/**
 * Raw recording bytes, not base64. Each adapter encodes only if its protocol
 * demands it (Gemini inlines base64; the Whisper shape posts the bytes as a
 * multipart file), so nothing carries an encoded copy further than it must —
 * and no caller can accidentally log one. See `transcribeVoiceNoteAction`.
 */
export type AudioInput = { bytes: Uint8Array; mimeType: string };

/**
 * Gemini transcribes through the same `generateContent` endpoint as text, with
 * the audio as an `inlineData` part beside the instruction. That's what makes
 * the language list from settings useful: unlike Whisper's single `language`
 * code, the instruction can name several languages at once and describe the
 * domain, and the model honours both.
 *
 * No `thinkingConfig` here (unlike `callGemini`): the 3.x models replaced
 * `thinkingBudget` with `thinkingLevel` and reject the old field outright, and
 * transcription has no reasoning worth suppressing anyway.
 */
async function transcribeGemini(cfg: ModelConfig, prompt: string, audio: AudioInput): Promise<string> {
  const base = cfg.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const json = (await post(
    `${base.replace(/\/$/, "")}/models/${cfg.model}:generateContent`,
    { "x-goog-api-key": cfg.apiKey },
    {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            // `inlineData` is base64-only, so this is the one place the audio is
            // encoded — inside the request body, never in a variable a log or an
            // error report could pick up.
            { inlineData: { mimeType: audio.mimeType, data: toBase64(audio.bytes) } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "text/plain",
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    },
    "gemini",
    "transcribe",
    TRANSCRIBE_TIMEOUT_MS,
  )) as GeminiResponse;

  const candidate = json.candidates?.[0];
  const parts = candidate?.content?.parts;
  // An *empty* reply is a valid answer here — the prompt asks for one when the
  // audio holds no speech — so only a structurally absent reply is a failure.
  // Blocked or truncated responses land here too (candidate, no parts), which
  // is what `finishReason`/`blockReason` are for.
  if (!Array.isArray(parts)) {
    noContent("gemini", "transcribe", {
      finishReason: candidate?.finishReason ?? null,
      blockReason: json.promptFeedback?.blockReason ?? null,
    });
  }
  return parts.map((p) => p.text ?? "").join("");
}

/**
 * The OpenAI `/audio/transcriptions` shape — multipart, and the de-facto
 * standard for Whisper wherever it's hosted (OpenAI, Groq, and OpenAI-compatible
 * gateways), so one adapter covers all of them via `base_url`.
 *
 * `prompt` here is only a *vocabulary* hint, not an instruction: Whisper uses it
 * to bias decoding, and it takes a single `language` code (which we deliberately
 * don't send — forcing one language on code-mixed speech transliterates the rest
 * into that script, so auto-detect wins). See `ai-transcribe.ts`.
 */
async function transcribeOpenAI(cfg: ModelConfig, prompt: string, audio: AudioInput): Promise<string> {
  const base = cfg.baseUrl || "https://api.openai.com/v1";
  const form = new FormData();
  form.append("model", cfg.model);
  form.append(
    "file",
    new Blob([audio.bytes as unknown as BlobPart], { type: audio.mimeType }),
    fileNameFor(audio.mimeType),
  );
  form.append("response_format", "json");
  form.append("temperature", String(TEMPERATURE));
  if (prompt) form.append("prompt", prompt);

  const json = (await post(
    `${base.replace(/\/$/, "")}/audio/transcriptions`,
    { Authorization: `Bearer ${cfg.apiKey}` },
    form,
    "openai",
    "transcribe",
    TRANSCRIBE_TIMEOUT_MS,
  )) as { text?: string };

  // As with Gemini: an empty transcript means "no speech", not "call failed".
  if (typeof json.text !== "string") noContent("openai", "transcribe");
  return json.text;
}

/**
 * Bytes → base64, chunked. `String.fromCharCode(...bytes)` in one call blows the
 * argument limit and throws `RangeError: Maximum call stack size exceeded` on a
 * recording of any real length, so walk it in slices.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * A filename for the multipart part. The Whisper endpoints sniff the container
 * from this extension, so an unrecognized one is rejected before decoding —
 * the blob's own MIME type isn't enough.
 */
function fileNameFor(mimeType: string): string {
  const base = mimeType.split(";")[0]!.trim().toLowerCase();
  const ext =
    base === "audio/mp4" || base === "audio/x-m4a"
      ? "m4a"
      : base === "audio/mpeg"
        ? "mp3"
        : base === "audio/ogg"
          ? "ogg"
          : base === "audio/wav" || base === "audio/x-wav"
            ? "wav"
            : "webm";
  return `voice-note.${ext}`;
}

/**
 * Transcribe a voice note, normalizing failures like `callProvider`. Anthropic
 * is absent on purpose — Claude has no speech-to-text model, so an entry
 * pointing there is a misconfiguration, not an upstream failure.
 */
export async function transcribeProvider(
  cfg: ModelConfig,
  prompt: string,
  audio: AudioInput,
): Promise<string> {
  if (cfg.provider === "anthropic") {
    logger.error("AI transcribe misconfigured — Anthropic has no speech-to-text model", {
      event: "ai.transcribe.bad_config",
      reason: "anthropic does not support audio input",
      provider: cfg.provider,
    });
    throw aiUnavailable();
  }
  try {
    return cfg.provider === "gemini"
      ? await transcribeGemini(cfg, prompt, audio)
      : await transcribeOpenAI(cfg, prompt, audio);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error(`AI transcribe request errored: ${describeError(err)}`, {
      event: "ai.transcribe.error",
      provider: cfg.provider,
      error: err,
    });
    throw aiFailed();
  }
}
