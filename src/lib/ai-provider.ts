import "server-only";
import { ApiError } from "@/lib/errors";
import { describeError, logger } from "@/lib/logger";

/**
 * The AI transport layer: the shared config/error vocabulary plus one generic
 * adapter per API protocol. **No model ids and no curated model list live here** —
 * only the request/response shape of each protocol. Which model runs is resolved
 * from the environment by `resolveModel()` in `ai-parse.ts`.
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

/**
 * POST JSON and read the body, with one timeout covering **both**. Aborting only
 * around `fetch` would leave the body read unbounded — `fetch` resolves as soon
 * as the headers land, so a provider that stalls mid-body would hang the request
 * until the platform killed it.
 */
async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  provider: Provider,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.error(`AI parse request failed with status ${res.status}`, {
        event: "ai.parse.http_error",
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

function noContent(provider: Provider, meta: Record<string, unknown> = {}): never {
  logger.error("AI parse returned no content", {
    event: "ai.parse.empty_response",
    provider,
    ...meta,
  });
  throw aiFailed();
}

async function callGemini(cfg: ModelConfig, system: string, userText: string): Promise<string> {
  const base = cfg.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const json = (await postJson(
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
    noContent("gemini", {
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
  const json = (await postJson(
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
    noContent("openai", {
      refused: Boolean(message?.refusal),
      finishReason: choice?.finish_reason ?? null,
    });
  }
  return message.content;
}

async function callAnthropic(cfg: ModelConfig, system: string, userText: string): Promise<string> {
  const base = cfg.baseUrl || "https://api.anthropic.com/v1";
  const json = (await postJson(
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
  if (!text.trim()) noContent("anthropic", { stopReason: json.stop_reason ?? null });
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
