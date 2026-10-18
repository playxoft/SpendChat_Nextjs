import "server-only";
import {
  aiUnavailable,
  PROVIDERS,
  THINKING_LEVELS,
  type ModelConfig,
  type Provider,
  type ThinkingLevel,
} from "@/lib/ai-provider";
import { logger } from "@/lib/logger";

/**
 * The shared "which model runs" resolver. **No model ids live in this repo** —
 * every model the app may call sits in ONE env var, and each AI feature names
 * the entry it uses:
 *
 *   AI_MODEL_LIST            A JSON object of named entries, each:
 *                              { "model_id": "...", "api_key": "...",
 *                                "provider"?: "...", "base_url"?: "...",
 *                                "project_id"?: "...", "location"?: "...",
 *                                "thinking_level"?: "..." }
 *                            The API key lives inside the entry — there are no
 *                            separate per-provider key vars. The last three are
 *                            Google's: `project_id`/`location` pick the Vertex
 *                            endpoint, `thinking_level` a Gemini 3+ model's tier.
 *   <FEATURE>_MODEL_CURRENT  The name of the entry that feature uses right now.
 *
 * Three features pick from the list, each on its own so they can run on
 * different models (text parsing on any chat model, transcription on a model
 * that actually accepts audio, Ask on whatever answers questions well):
 *
 *   AI_PARSE_MODEL_CURRENT       → `ai-parse.ts`
 *   AI_TRANSCRIBE_MODEL_CURRENT  → `ai-transcribe.ts`
 *   AI_CHAT_MODEL_CURRENT        → `ai-chat.ts`
 *
 * They never fall back to one another: an unset `_CURRENT` turns its feature
 * off even when another feature's names a working entry.
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
 *
 * Gemini means Vertex AI: the Gemini API (AI Studio keys) turns callers away by
 * location, and a Worker can run in one of those places (see `geminiUrl` in
 * `ai-provider.ts`). An entry still reaches it with `"provider": "gemini"`.
 */
export function inferProvider(modelId: string): Provider | null {
  const m = modelId.toLowerCase();
  if (m.includes("gemini")) return "vertex";
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gpt") || m.includes("chatgpt") || m.includes("whisper") || /^o[0-9]/.test(m)) {
    return "openai";
  }
  return null;
}

/** Each feature's env var naming its entry in `AI_MODEL_LIST`. */
const FEATURE_ENV = {
  parse: "AI_PARSE_MODEL_CURRENT",
  transcribe: "AI_TRANSCRIBE_MODEL_CURRENT",
  chat: "AI_CHAT_MODEL_CURRENT",
} as const;

export type AiFeature = keyof typeof FEATURE_ENV;

/** Google's project id rule: 6–30 of a–z, 0–9 and "-", starting with a letter, not ending in "-". */
const GCP_PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

/** `global`, `us`, `eu`, `us-central1`, `asia-south1` … */
const GCP_LOCATION = /^[a-z][a-z0-9-]*$/;

/**
 * Resolve a feature's active model: the `AI_MODEL_LIST` entry its `_CURRENT`
 * names. Throws `aiUnavailable` (503) when either var is unset, the JSON is
 * bad, the entry is missing, or it lacks model_id/api_key — the feature is
 * simply off until an operator configures it. No model or key default lives in
 * code by design.
 *
 * `feature` names the log event and the env var in operator-facing log lines
 * ("parse" → `ai.parse.bad_config`, `AI_PARSE_MODEL_CURRENT`).
 */
export function resolveModelFromEnv(feature: AiFeature): ModelConfig {
  const currentVar = FEATURE_ENV[feature];

  /**
   * Log a misconfiguration (never the list or a key) and fail as unavailable.
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

  const current = (process.env[currentVar] || "").trim();
  const rawList = (process.env.AI_MODEL_LIST || "").trim();
  if (!current || !rawList) {
    // `debug`, not `warn`: "the operator hasn't turned this on" is a steady
    // state, not an incident, and it would otherwise emit a line per click.
    logger.debug(`AI ${feature} skipped — AI_MODEL_LIST / ${currentVar} not configured`, {
      event: `ai.${feature}.unconfigured`,
      reason: !current ? `${currentVar} not set` : "AI_MODEL_LIST not set",
    });
    throw aiUnavailable();
  }

  let list: unknown;
  try {
    list = JSON.parse(rawList);
  } catch {
    misconfigured("AI_MODEL_LIST is not valid JSON");
  }
  if (!list || typeof list !== "object" || Array.isArray(list)) {
    misconfigured("AI_MODEL_LIST must be a JSON object of named entries");
  }

  const entry = (list as Record<string, unknown>)[current];
  if (!entry || typeof entry !== "object") {
    misconfigured(`${currentVar} names no entry in AI_MODEL_LIST`, { current });
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

  // Google's fields. Each goes into a URL or a request body, so a value that
  // isn't plainly shaped is refused rather than sent.
  const projectId = str(e.project_id) ?? str(e.projectId);
  const location = str(e.location)?.toLowerCase();
  const rawLevel = str(e.thinking_level) ?? str(e.thinkingLevel);
  if ((projectId || location) && provider !== "vertex") {
    misconfigured(`entry "${current}" sets project_id/location, which only a Vertex entry takes`, {
      current,
    });
  }
  if (projectId && !GCP_PROJECT_ID.test(projectId)) {
    misconfigured(`entry "${current}" has a project_id that isn't a Google Cloud project id`, { current });
  }
  if (location && !GCP_LOCATION.test(location)) {
    misconfigured(`entry "${current}" has a location that isn't a Google Cloud location`, { current });
  }
  if (location && location !== "global" && !projectId) {
    // Without a project the key's own project is used, which is served only
    // from the global endpoint.
    misconfigured(`entry "${current}" sets location "${location}" without project_id`, { current });
  }
  let thinkingLevel: ThinkingLevel | undefined;
  if (rawLevel) {
    const level = rawLevel.toUpperCase() as ThinkingLevel;
    if (provider !== "vertex" && provider !== "gemini") {
      misconfigured(`entry "${current}" sets thinking_level, which only a Gemini model takes`, { current });
    }
    if (!THINKING_LEVELS.has(level)) {
      misconfigured(`entry "${current}" has thinking_level "${rawLevel}" — use minimal, low, medium or high`, {
        current,
      });
    }
    thinkingLevel = level;
  }

  return {
    provider,
    model,
    apiKey,
    baseUrl: str(e.base_url) ?? str(e.baseUrl),
    projectId,
    location,
    thinkingLevel,
  };
}
