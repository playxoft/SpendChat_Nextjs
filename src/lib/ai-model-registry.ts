import "server-only";
import { aiUnavailable, PROVIDERS, type ModelConfig, type Provider } from "@/lib/ai-provider";
import { logger } from "@/lib/logger";

/**
 * The shared "which model runs" resolver. **No model ids live in this repo** —
 * each AI feature is configured by a pair of env vars holding a JSON registry
 * and the name of the active entry:
 *
 *   <FEATURE>_MODEL          A JSON object of named entries, each:
 *                              { "model_id": "...", "api_key": "...",
 *                                "provider"?: "...", "base_url"?: "..." }
 *                            The API key lives inside the entry — there are no
 *                            separate per-provider key vars.
 *   <FEATURE>_MODEL_CURRENT  The name of the entry to use right now.
 *
 * Two features use it today, each with its own independent pair so they can run
 * on different providers (text parsing on any chat model, transcription on a
 * model that actually accepts audio):
 *
 *   AI_PARSE_MODEL      / AI_PARSE_MODEL_CURRENT       → `ai-parse.ts`
 *   AI_TRANSCRIBE_MODEL / AI_TRANSCRIBE_MODEL_CURRENT  → `ai-transcribe.ts`
 *
 * Unset (or misconfigured) → that feature reports "not available" and nothing
 * else breaks. Kept out of `ai-provider.ts` (which is excluded from the coverage
 * gate as I/O wiring) because this resolution is pure logic and is unit-tested.
 */

/** Trimmed string or undefined — used to read optional entry fields loosely. */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Guess the API protocol from a model id when the entry doesn't name one.
 * Covers the first-party families plus Whisper, whose `/audio/transcriptions`
 * endpoint is the OpenAI shape on every host that serves it (OpenAI, Groq, and
 * the OpenAI-compatible crowd). Anything else must set `provider` explicitly.
 */
export function inferProvider(modelId: string): Provider | null {
  const m = modelId.toLowerCase();
  if (m.includes("gemini")) return "gemini";
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gpt") || m.includes("chatgpt") || m.includes("whisper") || /^o[0-9]/.test(m)) {
    return "openai";
  }
  return null;
}

/**
 * Resolve a feature's active model from its env pair. Throws `aiUnavailable`
 * (503) when either var is unset, the JSON is bad, the entry is missing, or it
 * lacks model_id/api_key — the feature is simply off until an operator
 * configures it. No model or key default lives in code by design.
 *
 * `feature` names the log event and the env vars in operator-facing log lines
 * ("parse" → `ai.parse.bad_config`, `AI_PARSE_MODEL`).
 */
export function resolveModelFromEnv(feature: "parse" | "transcribe"): ModelConfig {
  const prefix = feature === "parse" ? "AI_PARSE_MODEL" : "AI_TRANSCRIBE_MODEL";

  /**
   * Log a misconfiguration (never the registry or key) and fail as unavailable.
   * A nested *declaration*, not an arrow const: TypeScript only propagates a
   * `never` return through control-flow analysis for the former, and the calls
   * below rely on that to narrow the values they guard.
   */
  function misconfigured(reason: string, extra: Record<string, unknown> = {}): never {
    logger.error(`AI ${feature} misconfigured — ${reason}`, {
      event: `ai.${feature}.bad_config`,
      reason,
      ...extra,
    });
    throw aiUnavailable();
  }

  const current = (process.env[`${prefix}_CURRENT`] || "").trim();
  const rawRegistry = (process.env[prefix] || "").trim();
  if (!current || !rawRegistry) {
    // `debug`, not `warn`: "the operator hasn't turned this on" is a steady
    // state, not an incident, and it would otherwise emit a line per click.
    logger.debug(`AI ${feature} skipped — ${prefix} / ${prefix}_CURRENT not configured`, {
      event: `ai.${feature}.unconfigured`,
      reason: !current ? `${prefix}_CURRENT not set` : `${prefix} not set`,
    });
    throw aiUnavailable();
  }

  let registry: unknown;
  try {
    registry = JSON.parse(rawRegistry);
  } catch {
    misconfigured(`${prefix} is not valid JSON`);
  }
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    misconfigured(`${prefix} must be a JSON object of named entries`);
  }

  const entry = (registry as Record<string, unknown>)[current];
  if (!entry || typeof entry !== "object") {
    misconfigured(`${prefix}_CURRENT names no entry in ${prefix}`, { current });
  }
  const e = entry as Record<string, unknown>;

  const model = str(e.model_id) ?? str(e.model);
  const apiKey = str(e.api_key) ?? str(e.apiKey);
  if (!model || !apiKey) {
    misconfigured(`entry "${current}" needs both model_id and api_key`, { current });
  }

  const explicit = str(e.provider)?.toLowerCase() as Provider | undefined;
  const provider = explicit && PROVIDERS.has(explicit) ? explicit : inferProvider(model);
  if (!provider) {
    misconfigured(`could not infer a provider for "${model}" — add "provider" to the entry`, {
      current,
    });
  }

  return { provider, model, apiKey, baseUrl: str(e.base_url) ?? str(e.baseUrl) };
}
