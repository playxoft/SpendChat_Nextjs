import "server-only";
import { ApiError, badRequest } from "@/lib/errors";
import { describeError, logger } from "@/lib/logger";
import {
  TRANSACTION_AMOUNT_MAX,
  TRANSACTION_DESCRIPTION_MAX,
  TRANSACTION_TITLE_MAX,
} from "@/lib/validation";

/**
 * AI-assisted transaction entry: turn a free-text note like
 * "200 fruits, 100 veg, ₹1,000 on electricity, got 5000 salary" into a list of
 * structured drafts the user reviews before saving.
 *
 * ── Model choice lives entirely in the environment, never in this repo ──
 * This file contains NO model IDs and NO curated list of models — only generic
 * provider *adapters* (the request/response shape of each API protocol). Which
 * models exist and which one runs are both defined by two env vars:
 *
 *   AI_PARSE_MODEL          A JSON registry of models you define, keyed by any
 *                           name you choose, each value an entry:
 *                             { "model_id": "...", "api_key": "...",
 *                               "provider"?: "...", "base_url"?: "..." }
 *                           The API key lives inside the entry — there are no
 *                           separate per-provider key vars.
 *
 *   AI_PARSE_MODEL_CURRENT  The name of the entry to use right now.
 *
 * Entry fields:
 *   model_id   (required) the provider's model id — the only place a model name
 *              exists. `model` is accepted as an alias.
 *   api_key    (required) the key to call it with. `apiKey` alias accepted.
 *   provider   (optional) "gemini" | "openai" | "anthropic". Omit it and the
 *              provider is inferred from model_id (gemini* / claude* / gpt*|o*).
 *              Set it for anything the inference can't place (e.g. DeepSeek,
 *              Llama, Qwen — all use the "openai" shape).
 *   base_url   (optional) override the API base — how you point "openai" at an
 *              OpenAI-compatible host. `baseUrl` alias accepted.
 *
 * Example (set in Doppler, never committed):
 *   AI_PARSE_MODEL='{"primary":{"model_id":"...","api_key":"..."},
 *                    "alt":{"model_id":"...","api_key":"...","provider":"openai","base_url":"https://<openai-compatible-host>"}}'
 *   AI_PARSE_MODEL_CURRENT='primary'
 *
 * Unset (or misconfigured) → AI mode stays visible but returns a friendly
 * "not available" error; nothing else breaks.
 *
 * The call is over plain `fetch` (Workers-safe, same as `src/lib/email.ts`) and
 * awaited inline. The model output is treated as untrusted: `draftsFromRawJson`
 * re-validates every field and resolves category names against the workspace's
 * own list (unknown → null), so a hallucinated category or bad amount can't leak
 * in. That validation is a pure exported function, unit-tested directly; the
 * `fetch` wiring is excluded from the coverage gate (see vitest.config.ts).
 */

export type AiCategory = { name: string; kind: "income" | "expense" };

/** A parsed transaction, shaped for review then reuse of the bulk-save path. */
export type AiParsedDraft = {
  type: "income" | "expense";
  /** Positive, major units (e.g. 1000 for "₹1,000"). */
  amount: number;
  title: string;
  description?: string;
  /** An existing workspace category name (exact case) or null. */
  categoryName: string | null;
  /** YYYY-MM-DD. */
  occurredOn: string;
};

const MAX_INPUT_CHARS = 2000;
const MAX_DRAFTS = 50;
const REQUEST_TIMEOUT_MS = 20_000;

type Provider = "gemini" | "openai" | "anthropic";
export type ModelConfig = {
  provider: Provider;
  model: string;
  apiKey: string;
  baseUrl?: string;
};

const PROVIDERS = new Set<Provider>(["gemini", "openai", "anthropic"]);

/** Config missing / misconfigured — user-facing, distinct from an upstream failure. */
function aiUnavailable(): ApiError {
  return new ApiError(503, "ai_unavailable", "AI-assisted input isn't available right now.");
}

/** The provider was reached but the request failed or returned garbage. */
function aiFailed(): ApiError {
  return new ApiError(502, "ai_failed", "Couldn't reach the AI just now — please try again.");
}

/** Trimmed string or undefined — used to read optional entry fields loosely. */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Guess the API protocol from a model id when the entry doesn't name one.
 * Covers the three first-party families; anything else must set `provider`.
 */
function inferProvider(modelId: string): Provider | null {
  const m = modelId.toLowerCase();
  if (m.includes("gemini")) return "gemini";
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gpt") || m.includes("chatgpt") || /^o[0-9]/.test(m)) return "openai";
  return null;
}

/** Log a misconfiguration (never the registry or key) and fail as unavailable. */
function misconfigured(reason: string, extra: Record<string, unknown> = {}): never {
  logger.error(`AI parse misconfigured — ${reason}`, {
    event: "ai.parse.bad_config",
    reason,
    ...extra,
  });
  throw aiUnavailable();
}

/**
 * The active model: look up `AI_PARSE_MODEL_CURRENT` in the `AI_PARSE_MODEL`
 * registry and normalize its entry. Throws `aiUnavailable` when either var is
 * unset, the JSON is bad, the entry is missing, or it lacks model_id/api_key —
 * the feature is simply off until an operator configures it. No model or key
 * default lives in code by design.
 */
export function resolveModel(): ModelConfig {
  const current = (process.env.AI_PARSE_MODEL_CURRENT || "").trim();
  const rawRegistry = (process.env.AI_PARSE_MODEL || "").trim();
  if (!current || !rawRegistry) {
    logger.warn("AI parse skipped — AI_PARSE_MODEL / AI_PARSE_MODEL_CURRENT not configured", {
      event: "ai.parse.unconfigured",
      reason: !current ? "AI_PARSE_MODEL_CURRENT not set" : "AI_PARSE_MODEL not set",
    });
    throw aiUnavailable();
  }

  let registry: unknown;
  try {
    registry = JSON.parse(rawRegistry);
  } catch {
    misconfigured("AI_PARSE_MODEL is not valid JSON");
  }
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    misconfigured("AI_PARSE_MODEL must be a JSON object of named entries");
  }

  const entry = (registry as Record<string, unknown>)[current];
  if (!entry || typeof entry !== "object") {
    misconfigured("AI_PARSE_MODEL_CURRENT names no entry in AI_PARSE_MODEL", { current });
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
    misconfigured(`could not infer a provider for "${model}" — add "provider" to the entry`, { current });
  }

  return { provider, model, apiKey, baseUrl: str(e.base_url) ?? str(e.baseUrl) };
}

function buildSystemPrompt(
  currency: string,
  today: string,
  expenseNames: string[],
  incomeNames: string[],
): string {
  return [
    "You convert a person's free-text notes about money into structured transactions for a spending tracker.",
    "",
    "Context:",
    `- The workspace currency is ${currency}. Every amount you output is a plain positive number in that currency's main unit — write 1000 for "₹1,000" or "$1,000". Ignore any currency symbols or codes.`,
    `- Today's date is ${today} (YYYY-MM-DD).`,
    "",
    "Rules:",
    '1. Split the note into one transaction per distinct item or amount. "200 fruits, 100 vegetables, 1000 electricity" is three transactions.',
    "2. amount: the positive number only, in the main currency unit. Never negative, never zero.",
    '3. type: "expense" for money spent (the default) or "income" for money received (salary, refund, sold, paycheck, received, etc.). When unclear, use "expense".',
    `4. title: a short label for the item or merchant, at most ${TRANSACTION_TITLE_MAX} characters (e.g. "Fruits", "Electricity"). Never keep a #category tag or a (parenthetical) in the title — strip both out.`,
    '5. description: optional. When an item wraps text in parentheses, that parenthetical IS its description — "1200 electricity (June bill)" → description "June bill". Otherwise omit it or use null.',
    "6. categoryName: when an item carries a \"#name\" tag (e.g. \"500 groceries #Food\"), that is the user's chosen category — match it to the nearest Allowed category of that type and output that exact stored name. With no tag, pick the single best Allowed match. If nothing fits, use null. Never invent a name that is not in the Allowed list below.",
    "7. occurredOn: YYYY-MM-DD. Use today's date unless the note clearly states another date. Never use a future date.",
    "",
    `Allowed expense categories: ${expenseNames.length ? expenseNames.join(", ") : "(none)"}`,
    `Allowed income categories: ${incomeNames.length ? incomeNames.join(", ") : "(none)"}`,
    "",
    "Respond with ONLY a JSON object of this exact shape — no prose, no markdown, no code fences:",
    '{"transactions":[{"type":"expense","amount":0,"title":"","description":null,"categoryName":null,"occurredOn":"YYYY-MM-DD"}]}',
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Provider adapters — generic API shapes only, no model IDs. Thin      */
/* HTTP wiring, excluded from the coverage gate.                        */
/* ------------------------------------------------------------------ */

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
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  promptFeedback?: { blockReason?: string };
};
type OpenAiResponse = {
  choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }>;
};
type AnthropicResponse = { content?: Array<{ type?: string; text?: string }> };

async function fetchJson(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Shared upstream-error handling so each adapter stays small. */
async function readOrThrow(res: Response, provider: Provider): Promise<unknown> {
  if (!res.ok) {
    logger.error(`AI parse request failed with status ${res.status}`, {
      event: "ai.parse.http_error",
      provider,
      status: res.status,
      body: (await res.text()).slice(0, 500),
    });
    throw aiFailed();
  }
  return res.json();
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
  const url = `${base.replace(/\/$/, "")}/models/${cfg.model}:generateContent`;
  const res = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_SCHEMA,
        temperature: 0,
        maxOutputTokens: 2048,
      },
    }),
  });
  const json = (await readOrThrow(res, "gemini")) as GeminiResponse;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    noContent("gemini", { blockReason: json.promptFeedback?.blockReason ?? null });
  }
  return text;
}

async function callOpenAI(cfg: ModelConfig, system: string, userText: string): Promise<string> {
  // OpenAI Chat-Completions shape — also serves DeepSeek / Llama hosts / any
  // OpenAI-compatible endpoint via cfg.baseUrl. `json_object` mode is the most
  // portable structured output across those providers; the exact shape is
  // pinned by the system prompt and re-validated in `draftsFromRawJson`.
  const base = cfg.baseUrl || "https://api.openai.com/v1";
  const url = `${base.replace(/\/$/, "")}/chat/completions`;
  const res = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const json = (await readOrThrow(res, "openai")) as OpenAiResponse;
  const message = json.choices?.[0]?.message;
  if (message?.refusal || typeof message?.content !== "string" || !message.content.trim()) {
    noContent("openai", { refused: Boolean(message?.refusal) });
  }
  return message.content;
}

async function callAnthropic(cfg: ModelConfig, system: string, userText: string): Promise<string> {
  const base = cfg.baseUrl || "https://api.anthropic.com/v1";
  const url = `${base.replace(/\/$/, "")}/messages`;
  const res = await fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  const json = (await readOrThrow(res, "anthropic")) as AnthropicResponse;
  const text = (json.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) noContent("anthropic");
  return text;
}

async function callProvider(cfg: ModelConfig, system: string, userText: string): Promise<string> {
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

/* ------------------------------------------------------------------ */
/* Pure parsing / validation — unit-tested directly.                  */
/* ------------------------------------------------------------------ */

/** YYYY-MM-DD passthrough, defaulting to and never exceeding `today`. */
function normalizeDate(raw: string | undefined, today: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw > today ? today : raw;
  return today;
}

/**
 * Parse a model's text response into JSON, tolerating the quirks different
 * providers add: markdown code fences, or a JSON object embedded in prose.
 * Throws `aiFailed` when no JSON can be recovered.
 */
function parseLoose(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1]! : raw).trim();
  try {
    return JSON.parse(body);
  } catch {
    // Fall back to the widest {...} / [...] span in the text.
    const start = body.search(/[[{]/);
    const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    logger.error("AI parse returned non-JSON", { event: "ai.parse.bad_json" });
    throw aiFailed();
  }
}

/**
 * Turn a provider's raw text response into validated drafts. The model output
 * is untrusted, so every field is re-derived defensively and any row that can't
 * become a valid transaction is skipped (mirrors the bulk importer, which drops
 * individually-invalid rows rather than failing the batch). Category names are
 * resolved against the workspace list — unknown names become null, so a
 * hallucinated category can never reach the DB.
 *
 * Throws `badRequest` (400) when nothing usable comes out, `aiFailed` (502) when
 * the response isn't parseable JSON.
 */
export function draftsFromRawJson(
  raw: string,
  opts: { categories: AiCategory[]; today: string },
): AiParsedDraft[] {
  const payload = parseLoose(raw);

  const items =
    payload && typeof payload === "object" && Array.isArray((payload as { transactions?: unknown }).transactions)
      ? (payload as { transactions: unknown[] }).transactions
      : Array.isArray(payload)
        ? (payload as unknown[])
        : [];

  // Resolve the model's category choice back to the stored casing so the
  // name+kind lookup in `createBulkFromDrafts` finds an id; unknown → null.
  const canonical = new Map<string, string>();
  for (const c of opts.categories) canonical.set(`${c.kind}:${c.name.toLowerCase()}`, c.name);

  const drafts: AiParsedDraft[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;

    const type: "income" | "expense" = o.type === "income" ? "income" : "expense";

    const amount = typeof o.amount === "number" ? o.amount : Number(o.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > TRANSACTION_AMOUNT_MAX) continue;

    const title = typeof o.title === "string" ? o.title.trim().slice(0, TRANSACTION_TITLE_MAX) : "";
    if (!title) continue; // a transaction needs a title, same as the composer

    const descRaw = typeof o.description === "string" ? o.description.trim() : "";
    const description = descRaw ? descRaw.slice(0, TRANSACTION_DESCRIPTION_MAX) : undefined;

    const rawCat = typeof o.categoryName === "string" ? o.categoryName.trim() : "";
    const categoryName = rawCat ? (canonical.get(`${type}:${rawCat.toLowerCase()}`) ?? null) : null;

    const occurredOn = normalizeDate(typeof o.occurredOn === "string" ? o.occurredOn : undefined, opts.today);

    drafts.push({ type, amount, title, description, categoryName, occurredOn });
    if (drafts.length >= MAX_DRAFTS) break;
  }

  if (drafts.length === 0) {
    throw badRequest(
      'I couldn\'t find any transactions in that. Try something like "200 fruits, 100 veg, 1000 electricity".',
    );
  }

  return drafts;
}

/**
 * Parse a free-text note into reviewable transaction drafts. Throws an
 * `ApiError` the caller surfaces to the user: 503 when AI isn't configured, 502
 * on an upstream failure, 400 when the note yields nothing usable.
 */
export async function parseTransactionsText(opts: {
  text: string;
  categories: AiCategory[];
  currency: string;
  locale: string;
  today: string;
}): Promise<AiParsedDraft[]> {
  const text = opts.text.trim();
  if (!text) throw badRequest("Type a note for the AI to turn into transactions");
  if (text.length > MAX_INPUT_CHARS) {
    throw badRequest(`That's a lot of text — keep it under ${MAX_INPUT_CHARS} characters`);
  }

  const cfg = resolveModel();
  const expenseNames: string[] = [];
  const incomeNames: string[] = [];
  for (const c of opts.categories) {
    (c.kind === "income" ? incomeNames : expenseNames).push(c.name);
  }

  const system = buildSystemPrompt(opts.currency, opts.today, expenseNames, incomeNames);
  const raw = await callProvider(cfg, system, text);
  const drafts = draftsFromRawJson(raw, { categories: opts.categories, today: opts.today });

  logger.info(`AI parsed ${drafts.length} transaction(s) from a ${text.length}-char note`, {
    event: "ai.parse.ok",
    provider: cfg.provider,
    model: cfg.model,
    count: drafts.length,
    chars: text.length,
  });

  return drafts;
}
