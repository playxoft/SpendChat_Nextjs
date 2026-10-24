import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { TAGS_PER_TRANSACTION_MAX } from "@/lib/validation";
import { MAX_INPUT_CHARS } from "@/lib/ai-limits";
import { resolveModelFromEnv } from "@/lib/ai-model-registry";
import { callProviderWithUsage } from "@/lib/ai-provider";
import { logger } from "@/lib/logger";
import {
  draftsFromRawJson,
  parseTransactionsText,
  resolveModel,
  type AiCategory,
} from "@/lib/ai-parse";

const CATEGORIES: AiCategory[] = [
  { name: "Groceries", kind: "expense" },
  { name: "Electricity", kind: "expense" },
  { name: "Salary", kind: "income" },
];
const TODAY = "2026-07-27";

/** Wrap rows in the `{ transactions: [...] }` envelope the models return. */
const wrap = (transactions: unknown[]) => JSON.stringify({ transactions });

/** Run a throwing fn and hand back the ApiError it raised. */
function caught(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("expected the call to throw");
}

/** Configure the model list with a single named entry + select it for parsing. */
function setModel(entry: Record<string, unknown>, name = "current") {
  vi.stubEnv("AI_MODEL_LIST", JSON.stringify({ [name]: entry }));
  vi.stubEnv("AI_PARSE_MODEL_CURRENT", name);
}

describe("draftsFromRawJson — the untrusted-output validator", () => {
  it("maps a valid multi-item response into drafts", () => {
    const out = draftsFromRawJson(
      wrap([
        { type: "expense", amount: 200, title: "Fruits", categoryName: "Groceries", occurredOn: TODAY },
        { type: "income", amount: 5000, title: "Salary", categoryName: "Salary", occurredOn: TODAY },
      ]),
      { categories: CATEGORIES, today: TODAY },
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: "expense", amount: 200, title: "Fruits", categoryName: "Groceries" });
    expect(out[1]).toMatchObject({ type: "income", amount: 5000, title: "Salary", categoryName: "Salary" });
  });

  describe("category resolution against the workspace list", () => {
    it("matches case-insensitively and normalizes to the stored casing", () => {
      const [d] = draftsFromRawJson(
        wrap([{ type: "expense", amount: 10, title: "x", categoryName: "grOceRies", occurredOn: TODAY }]),
        { categories: CATEGORIES, today: TODAY },
      );
      expect(d!.categoryName).toBe("Groceries");
    });

    it("drops a category that isn't in the list to null", () => {
      const [d] = draftsFromRawJson(
        wrap([{ type: "expense", amount: 10, title: "x", categoryName: "Crypto", occurredOn: TODAY }]),
        { categories: CATEGORIES, today: TODAY },
      );
      expect(d!.categoryName).toBeNull();
    });

    it("drops a real name used with the wrong kind (Salary is income-only)", () => {
      const [d] = draftsFromRawJson(
        wrap([{ type: "expense", amount: 10, title: "x", categoryName: "Salary", occurredOn: TODAY }]),
        { categories: CATEGORIES, today: TODAY },
      );
      expect(d!.categoryName).toBeNull();
    });

    it("treats a null / missing category as uncategorized", () => {
      const [d] = draftsFromRawJson(
        wrap([{ type: "expense", amount: 10, title: "x", categoryName: null, occurredOn: TODAY }]),
        { categories: CATEGORIES, today: TODAY },
      );
      expect(d!.categoryName).toBeNull();
    });
  });

  describe("amount validation", () => {
    const build = (amount: unknown) =>
      draftsFromRawJson(wrap([{ type: "expense", amount, title: "x", occurredOn: TODAY }]), {
        categories: CATEGORIES,
        today: TODAY,
      });

    it("coerces a numeric string", () => {
      expect(build("50")[0]!.amount).toBe(50);
    });

    it("skips zero, negative, non-numeric, and over-cap amounts", () => {
      for (const bad of [0, -5, "abc", 1_000_000_000]) {
        expect(caught(() => build(bad)).status).toBe(400);
      }
    });
  });

  it("requires a title — a titleless row is dropped", () => {
    expect(
      caught(() =>
        draftsFromRawJson(wrap([{ type: "expense", amount: 10, title: "   ", occurredOn: TODAY }]), {
          categories: CATEGORIES,
          today: TODAY,
        }),
      ).status,
    ).toBe(400);
  });

  it("truncates over-long title / description to the field caps", () => {
    const [d] = draftsFromRawJson(
      wrap([
        {
          type: "expense",
          amount: 10,
          title: "T".repeat(80),
          description: "D".repeat(300),
          occurredOn: TODAY,
        },
      ]),
      { categories: CATEGORIES, today: TODAY },
    );
    expect(d!.title).toHaveLength(40);
    expect(d!.description).toHaveLength(150);
  });

  it("cuts a long title at a word and carries the rest into the description", () => {
    const [plain, withDesc] = draftsFromRawJson(
      wrap([
        { type: "expense", amount: 320, title: "Ravi lunch Saravana Bhavan Zomato with team", occurredOn: TODAY },
        {
          type: "expense",
          amount: 320,
          title: "Ravi lunch Saravana Bhavan Zomato with team",
          description: "office treat",
          occurredOn: TODAY,
        },
      ]),
      { categories: CATEGORIES, today: TODAY },
    );
    expect(plain!.title).toBe("Ravi lunch Saravana Bhavan Zomato with");
    expect(plain!.description).toBe("Team");
    expect(withDesc!.title).toBe("Ravi lunch Saravana Bhavan Zomato with");
    expect(withDesc!.description).toBe("Team — Office treat");
  });

  it("keeps a title of exactly the cap whole, with nothing carried", () => {
    const title = "Abcd efgh ijkl mnop qrst uvwx yzab cdefg"; // 40 characters
    expect(title).toHaveLength(40);
    const [d] = draftsFromRawJson(wrap([{ type: "expense", amount: 1, title, occurredOn: TODAY }]), {
      categories: CATEGORIES,
      today: TODAY,
    });
    expect(d!.title).toBe(title);
    expect(d!.description).toBeUndefined();
  });

  it("clamps after sentence-casing, so a first letter that grows can't push it over", () => {
    // "\u00df".toUpperCase() is "SS": casing a string that was already cut to the
    // cap handed the confirm path a title one character too long for its Zod
    // schema — a draft that looked fine in the review grid and failed on send.
    const [d] = draftsFromRawJson(
      wrap([
        {
          type: "expense",
          amount: 10,
          title: "\u00df" + "a".repeat(39),
          description: "\u00df" + "b".repeat(149),
          occurredOn: TODAY,
        },
      ]),
      { categories: CATEGORIES, today: TODAY },
    );
    expect(d!.title).toHaveLength(40);
    expect(d!.title.startsWith("SS")).toBe(true);
    expect(d!.description).toHaveLength(150);
  });

  it("sentence-cases the title and description, leaving the rest of the casing alone", () => {
    const [d] = draftsFromRawJson(
      wrap([
        {
          type: "expense",
          amount: 10,
          title: "banana",
          description: "from the iPhone store",
          occurredOn: TODAY,
        },
      ]),
      { categories: CATEGORIES, today: TODAY },
    );
    expect(d!.title).toBe("Banana");
    expect(d!.description).toBe("From the iPhone store");
  });

  it("leaves a title that doesn't start with a letter untouched", () => {
    const [d] = draftsFromRawJson(
      wrap([{ type: "expense", amount: 10, title: "3M tape", occurredOn: TODAY }]),
      { categories: CATEGORIES, today: TODAY },
    );
    expect(d!.title).toBe("3M tape");
  });

  it("omits description when the model returns blank", () => {
    const [d] = draftsFromRawJson(
      wrap([{ type: "expense", amount: 10, title: "x", description: "  ", occurredOn: TODAY }]),
      { categories: CATEGORIES, today: TODAY },
    );
    expect(d!.description).toBeUndefined();
  });

  it("defaults an unknown / missing type to expense", () => {
    const [a] = draftsFromRawJson(wrap([{ type: "transfer", amount: 10, title: "x", occurredOn: TODAY }]), {
      categories: CATEGORIES,
      today: TODAY,
    });
    const [b] = draftsFromRawJson(wrap([{ amount: 10, title: "x", occurredOn: TODAY }]), {
      categories: CATEGORIES,
      today: TODAY,
    });
    expect(a!.type).toBe("expense");
    expect(b!.type).toBe("expense");
  });

  describe("date normalization", () => {
    const dateOf = (occurredOn: unknown) =>
      draftsFromRawJson(wrap([{ type: "expense", amount: 10, title: "x", occurredOn }]), {
        categories: CATEGORIES,
        today: TODAY,
      })[0]!.occurredOn;

    it("keeps a valid past date", () => {
      expect(dateOf("2026-01-15")).toBe("2026-01-15");
    });
    it("clamps a future date to today", () => {
      expect(dateOf("2099-01-01")).toBe(TODAY);
    });
    it("falls back to today for missing or malformed dates", () => {
      expect(dateOf(undefined)).toBe(TODAY);
      expect(dateOf("15/01/2026")).toBe(TODAY);
    });
  });

  it("caps the number of drafts", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      type: "expense",
      amount: i + 1,
      title: `Item ${i}`,
      occurredOn: TODAY,
    }));
    expect(draftsFromRawJson(wrap(many), { categories: CATEGORIES, today: TODAY })).toHaveLength(50);
  });

  it("skips non-object rows in the array", () => {
    const out = draftsFromRawJson(
      wrap([null, "nope", 42, { type: "expense", amount: 10, title: "Real", occurredOn: TODAY }]),
      { categories: CATEGORIES, today: TODAY },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe("Real");
  });

  it("accepts a bare top-level array (no wrapper object)", () => {
    const out = draftsFromRawJson(
      JSON.stringify([{ type: "expense", amount: 10, title: "x", occurredOn: TODAY }]),
      { categories: CATEGORIES, today: TODAY },
    );
    expect(out).toHaveLength(1);
  });

  describe("tolerates provider output quirks", () => {
    const one = wrap([{ type: "expense", amount: 12, title: "Lunch", occurredOn: TODAY }]);

    it("strips ```json code fences", () => {
      const out = draftsFromRawJson("```json\n" + one + "\n```", { categories: CATEGORIES, today: TODAY });
      expect(out[0]!.title).toBe("Lunch");
    });

    it("extracts a JSON object embedded in prose", () => {
      const out = draftsFromRawJson(`Sure, here you go: ${one} — hope that helps!`, {
        categories: CATEGORIES,
        today: TODAY,
      });
      expect(out[0]!.amount).toBe(12);
    });
  });

  it("throws 400 when the response has no usable transactions", () => {
    expect(caught(() => draftsFromRawJson(wrap([]), { categories: CATEGORIES, today: TODAY })).status).toBe(400);
    expect(
      caught(() => draftsFromRawJson(JSON.stringify({ transactions: "x" }), { categories: CATEGORIES, today: TODAY }))
        .status,
    ).toBe(400);
  });

  it("throws 502 on a response with no recoverable JSON", () => {
    expect(caught(() => draftsFromRawJson("not json at all", { categories: CATEGORIES, today: TODAY })).status).toBe(
      502,
    );
  });

  // What a too-small output budget looks like from here: the reply stops
  // mid-object, so even the widest {...} span is unbalanced. It must surface as
  // an upstream failure (502) and never as a partial, silently-shortened list.
  it("throws 502 on a reply truncated mid-object rather than saving a partial list", () => {
    const truncated =
      '{"transactions":[{"type":"expense","amount":200,"title":"Fruits","occurredOn":"' +
      TODAY +
      '"},{"type":"expense","amount":100,"title":"Veg';
    expect(caught(() => draftsFromRawJson(truncated, { categories: CATEGORIES, today: TODAY })).status).toBe(502);
  });
});

describe("resolveModel — the shared model list + parse's current entry, no models in code", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws 503 when either env var is unset", () => {
    vi.stubEnv("AI_MODEL_LIST", "");
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "x");
    expect(caught(() => resolveModel()).status).toBe(503);

    vi.stubEnv("AI_MODEL_LIST", JSON.stringify({ x: { model_id: "gemini-x", api_key: "k" } }));
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "");
    expect(caught(() => resolveModel()).status).toBe(503);
  });

  it("ignores the old per-feature list — AI_MODEL_LIST is the only one read", () => {
    vi.stubEnv("AI_MODEL_LIST", "");
    vi.stubEnv("AI_PARSE_MODEL", JSON.stringify({ x: { model_id: "gemini-x", api_key: "k" } }));
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "x");
    expect(caught(() => resolveModel()).status).toBe(503);
  });

  it("lets several features name the same entry", () => {
    vi.stubEnv("AI_MODEL_LIST", JSON.stringify({ shared: { model_id: "gemini-x", api_key: "k" } }));
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "shared");
    vi.stubEnv("AI_CHAT_MODEL_CURRENT", "shared");
    expect(resolveModel()).toMatchObject({ provider: "vertex", model: "gemini-x" });
    expect(resolveModelFromEnv("chat")).toMatchObject({ provider: "vertex", model: "gemini-x" });
  });

  it("throws 503 when the list isn't a JSON object", () => {
    vi.stubEnv("AI_MODEL_LIST", "not json");
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "x");
    expect(caught(() => resolveModel()).status).toBe(503);

    vi.stubEnv("AI_MODEL_LIST", JSON.stringify(["gemini-x"]));
    expect(caught(() => resolveModel()).status).toBe(503);
  });

  it("throws 503 when the current name names no entry", () => {
    vi.stubEnv("AI_MODEL_LIST", JSON.stringify({ a: { model_id: "gemini-x", api_key: "k" } }));
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "b");
    expect(caught(() => resolveModel()).status).toBe(503);
  });

  it("throws 503 when the entry is missing model_id or api_key", () => {
    setModel({ model_id: "gemini-x" });
    expect(caught(() => resolveModel()).status).toBe(503);
    setModel({ api_key: "k" });
    expect(caught(() => resolveModel()).status).toBe(503);
  });

  it("infers the provider from the model id — Gemini through Vertex", () => {
    setModel({ model_id: "gemini-2.5-flash", api_key: "k" });
    expect(resolveModel()).toMatchObject({ provider: "vertex", model: "gemini-2.5-flash", apiKey: "k" });
    setModel({ model_id: "claude-haiku-4-5", api_key: "k" });
    expect(resolveModel().provider).toBe("anthropic");
    setModel({ model_id: "gpt-5.4-nano", api_key: "k" });
    expect(resolveModel().provider).toBe("openai");
    setModel({ model_id: "o3-mini", api_key: "k" });
    expect(resolveModel().provider).toBe("openai");
  });

  it("lets an explicit provider override inference, and carries base_url through", () => {
    setModel({ model_id: "deepseek-chat", api_key: "k", provider: "openai", base_url: "https://api.deepseek.com" });
    expect(resolveModel()).toMatchObject({
      provider: "openai",
      model: "deepseek-chat",
      apiKey: "k",
      baseUrl: "https://api.deepseek.com",
    });
  });

  it("throws 503 when the provider can't be inferred and none is given", () => {
    setModel({ model_id: "deepseek-chat", api_key: "k" });
    expect(caught(() => resolveModel()).status).toBe(503);
  });

  it("still reaches the Gemini API when an entry names it", () => {
    setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini" });
    expect(resolveModel().provider).toBe("gemini");
  });

  it("carries Vertex's project, location and a Gemini thinking level", () => {
    setModel({
      model_id: "gemini-x",
      api_key: "k",
      project_id: "spendchat-prod",
      location: "US-Central1",
      thinking_level: "low",
    });
    expect(resolveModel()).toMatchObject({
      provider: "vertex",
      projectId: "spendchat-prod",
      location: "us-central1",
      thinkingLevel: "LOW",
    });
    setModel({ model_id: "gemini-x", api_key: "k", projectId: "spendchat-prod", thinkingLevel: "MINIMAL" });
    expect(resolveModel()).toMatchObject({ projectId: "spendchat-prod", thinkingLevel: "MINIMAL" });
    // The global endpoint needs no project: the key's own is used.
    setModel({ model_id: "gemini-x", api_key: "k", location: "global" });
    expect(resolveModel()).toMatchObject({ location: "global", projectId: undefined });
    // A thinking level on the Gemini API is fine too.
    setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini", thinking_level: "high" });
    expect(resolveModel()).toMatchObject({ provider: "gemini", thinkingLevel: "HIGH" });
  });

  it("throws 503 for Google fields it can't use as given", () => {
    // Vertex-only fields on another provider.
    setModel({ model_id: "gpt-x", api_key: "k", project_id: "spendchat-prod" });
    expect(caught(() => resolveModel()).status).toBe(503);
    setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini", location: "global" });
    expect(caught(() => resolveModel()).status).toBe(503);
    // Shapes that would end up in the URL.
    setModel({ model_id: "gemini-x", api_key: "k", project_id: "Spend/Chat" });
    expect(caught(() => resolveModel()).status).toBe(503);
    setModel({ model_id: "gemini-x", api_key: "k", project_id: "spendchat-prod", location: "us/../x" });
    expect(caught(() => resolveModel()).status).toBe(503);
    // A region needs a project — without one only the global endpoint serves.
    setModel({ model_id: "gemini-x", api_key: "k", location: "us-central1" });
    expect(caught(() => resolveModel()).status).toBe(503);
    // A thinking level only a Gemini model takes, and only a real one.
    setModel({ model_id: "claude-x", api_key: "k", thinking_level: "low" });
    expect(caught(() => resolveModel()).status).toBe(503);
    setModel({ model_id: "gemini-x", api_key: "k", thinking_level: "extreme" });
    expect(caught(() => resolveModel()).status).toBe(503);
  });

  it("accepts camelCase field aliases (model / apiKey / baseUrl)", () => {
    setModel({ model: "gemini-x", apiKey: "k", baseUrl: "https://example.test" });
    expect(resolveModel()).toMatchObject({ provider: "vertex", model: "gemini-x", apiKey: "k", baseUrl: "https://example.test" });
  });

  it("goes direct, with no proxy key, while AI_PROXY_KEY is unset or blank", () => {
    for (const value of ["", "   "]) {
      vi.stubEnv("AI_PROXY_KEY", value);
      setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini" });
      expect(resolveModel()).toMatchObject({ provider: "gemini" });
      expect(resolveModel()).not.toHaveProperty("proxyKey");
    }
  });

  it("routes Gemini API, OpenAI and Anthropic entries through the proxy once AI_PROXY_KEY is set", () => {
    vi.stubEnv("AI_PROXY_KEY", " pxk_test ");
    setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini" });
    expect(resolveModel()).toMatchObject({ provider: "gemini", apiKey: "k", proxyKey: "pxk_test" });
    setModel({ model_id: "gpt-x", api_key: "k" });
    expect(resolveModel()).toMatchObject({ provider: "openai", proxyKey: "pxk_test" });
    setModel({ model_id: "claude-x", api_key: "k" });
    expect(resolveModel()).toMatchObject({ provider: "anthropic", proxyKey: "pxk_test" });
    setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini", thinking_level: "low" });
    expect(resolveModel()).toMatchObject({ provider: "gemini", proxyKey: "pxk_test", thinkingLevel: "LOW" });
  });

  it("keeps a gemini* id on Vertex either way, so switching the proxy key never meets a key with the wrong API", () => {
    for (const value of ["", "pxk_test"]) {
      vi.stubEnv("AI_PROXY_KEY", value);
      setModel({ model_id: "gemini-x", api_key: "k" });
      expect(resolveModel()).toMatchObject({ provider: "vertex" });
      expect(resolveModel()).not.toHaveProperty("proxyKey");
    }
  });

  it("keeps a base_url host and Vertex direct, and never hands them the proxy key", () => {
    vi.stubEnv("AI_PROXY_KEY", "pxk_test");
    setModel({ model_id: "grok-x", api_key: "k", provider: "openai", base_url: "https://api.x.ai/v1" });
    expect(resolveModel()).not.toHaveProperty("proxyKey");
    setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini", base_url: "https://example.test/v1beta" });
    expect(resolveModel()).not.toHaveProperty("proxyKey");
    setModel({ model_id: "gemini-x", api_key: "k", base_url: "https://example.test/v1" });
    expect(resolveModel()).toMatchObject({ provider: "vertex" });
    expect(resolveModel()).not.toHaveProperty("proxyKey");
    setModel({ model_id: "gemini-x", api_key: "k", provider: "vertex" });
    expect(resolveModel()).not.toHaveProperty("proxyKey");
    // Vertex's own fields keep an entry on Vertex rather than making it invalid.
    setModel({ model_id: "gemini-x", api_key: "k", project_id: "spendchat-prod", location: "us" });
    expect(resolveModel()).toMatchObject({ provider: "vertex", projectId: "spendchat-prod" });
    expect(resolveModel()).not.toHaveProperty("proxyKey");
  });

  it("refuses an unknown provider rather than guessing one from the model id", () => {
    setModel({ model_id: "gemini-x", api_key: "k", provider: "vertexai" });
    expect(caught(() => resolveModel()).status).toBe(503);
  });

  it("refuses a key a request header can't carry, and never logs it", () => {
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    setModel({ model_id: "gemini-x", api_key: "k\nnext" });
    expect(caught(() => resolveModel()).status).toBe(503);
    vi.stubEnv("AI_PROXY_KEY", "pxk_\u00fc");
    setModel({ model_id: "gpt-x", api_key: "k" });
    expect(caught(() => resolveModel()).status).toBe(503);
    expect(error).toHaveBeenCalledWith(
      "AI parse misconfigured — AI_PROXY_KEY has characters a request header can't carry",
      expect.objectContaining({ event: "ai.parse.bad_config" }),
    );
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toContain("next");
    expect(logged).not.toContain("pxk_");
    error.mockRestore();
  });
});

describe("parseTransactionsText — provider wiring", () => {
  const OPTS = { categories: CATEGORIES, currency: "INR", locale: "en-IN", today: TODAY };
  const okBody = wrap([{ type: "expense", amount: 200, title: "Fruits", categoryName: "Groceries", occurredOn: TODAY }]);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const geminiOk = () =>
    vi.fn(async () => ({
      ok: true,
      headers: new Headers(),
      json: async () => ({ candidates: [{ content: { parts: [{ text: okBody }] } }] }),
      text: async () => "",
    }));
  const openaiOk = () =>
    vi.fn(async () => ({
      ok: true,
      headers: new Headers(),
      json: async () => ({ choices: [{ message: { content: okBody } }] }),
      text: async () => "",
    }));
  const anthropicOk = () =>
    vi.fn(async () => ({
      ok: true,
      headers: new Headers(),
      json: async () => ({ content: [{ type: "text", text: okBody }] }),
      text: async () => "",
    }));

  it("rejects an empty note before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(parseTransactionsText({ ...OPTS, text: "   " })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an over-long note before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      parseTransactionsText({ ...OPTS, text: "x".repeat(MAX_INPUT_CHARS + 1) }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 when nothing is configured", async () => {
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "");
    vi.stubGlobal("fetch", vi.fn());
    await expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).rejects.toMatchObject({ status: 503 });
  });

  /** The URL, headers and parsed body of the nth request a fetch mock saw. */
  const sent = (fetchMock: ReturnType<typeof vi.fn>, n = 0) => {
    const [url, init] = fetchMock.mock.calls[n] as unknown as [string, { headers: Record<string, string>; body: string }];
    return { url, headers: init.headers, body: JSON.parse(init.body) };
  };

  it("calls Gemini through Vertex AI and returns validated drafts", async () => {
    setModel({ model_id: "gemini-x", api_key: "k" });
    const fetchMock = geminiOk();
    vi.stubGlobal("fetch", fetchMock);

    const drafts = await parseTransactionsText({ ...OPTS, text: "200 fruits" });
    expect(drafts[0]).toMatchObject({ amount: 200, title: "Fruits", categoryName: "Groceries" });
    const { url, headers } = sent(fetchMock);
    // No project: the key's own, on the global endpoint.
    expect(url).toBe("https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-x:generateContent");
    expect(headers["x-goog-api-key"]).toBe("k");
  });

  it("puts a Vertex project and location in the path, on the host that serves it", async () => {
    const urlFor = async (entry: Record<string, unknown>) => {
      setModel({ model_id: "gemini-x", api_key: "k", ...entry });
      const fetchMock = geminiOk();
      vi.stubGlobal("fetch", fetchMock);
      await parseTransactionsText({ ...OPTS, text: "200 fruits" });
      return sent(fetchMock).url;
    };
    const model = "publishers/google/models/gemini-x:generateContent";
    expect(await urlFor({ project_id: "spendchat-prod" })).toBe(
      `https://aiplatform.googleapis.com/v1/projects/spendchat-prod/locations/global/${model}`,
    );
    expect(await urlFor({ project_id: "spendchat-prod", location: "us" })).toBe(
      `https://aiplatform.us.rep.googleapis.com/v1/projects/spendchat-prod/locations/us/${model}`,
    );
    expect(await urlFor({ project_id: "spendchat-prod", location: "asia-south1" })).toBe(
      `https://asia-south1-aiplatform.googleapis.com/v1/projects/spendchat-prod/locations/asia-south1/${model}`,
    );
    expect(await urlFor({ base_url: "https://proxy.example/v1/" })).toBe(`https://proxy.example/v1/${model}`);
  });

  it("calls the Gemini API when an entry names it", async () => {
    setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini" });
    const fetchMock = geminiOk();
    vi.stubGlobal("fetch", fetchMock);

    await parseTransactionsText({ ...OPTS, text: "200 fruits" });
    const { url, headers } = sent(fetchMock);
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent");
    expect(headers["x-goog-api-key"]).toBe("k");
  });

  it("turns thinking off only where the old budget still works, and sends a configured level", async () => {
    const thinkingFor = async (entry: Record<string, unknown>) => {
      setModel({ api_key: "k", ...entry });
      const fetchMock = geminiOk();
      vi.stubGlobal("fetch", fetchMock);
      await parseTransactionsText({ ...OPTS, text: "200 fruits" });
      return sent(fetchMock).body.generationConfig.thinkingConfig;
    };
    expect(await thinkingFor({ model_id: "gemini-2.5-flash" })).toEqual({ thinkingBudget: 0 });
    // Gemini 3 takes a level, not a budget, and 400s on the budget now and then.
    expect(await thinkingFor({ model_id: "gemini-3.1-flash-lite" })).toBeUndefined();
    expect(await thinkingFor({ model_id: "gemini-3-flash-preview", thinking_level: "minimal" })).toEqual({
      thinkingLevel: "MINIMAL",
    });
  });

  describe("retries on Vertex's shared capacity", () => {
    const busy = { ok: false, status: 429, headers: new Headers(), json: async () => ({}), text: async () => '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}' };
    const ok = { ok: true, headers: new Headers(), status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: okBody }] } }] }), text: async () => "" };

    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries a 429 after a backoff and returns the answer", async () => {
      vi.useFakeTimers();
      setModel({ model_id: "gemini-x", api_key: "k" });
      const fetchMock = vi.fn().mockResolvedValueOnce(busy).mockResolvedValueOnce(ok);
      vi.stubGlobal("fetch", fetchMock);

      const parsed = parseTransactionsText({ ...OPTS, text: "200 fruits" });
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(300);
      await expect(parsed).resolves.toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // The same request, byte for byte.
      expect(sent(fetchMock, 1).body).toEqual(sent(fetchMock, 0).body);
    });

    it("gives up after three attempts", async () => {
      vi.useFakeTimers();
      setModel({ model_id: "gemini-x", api_key: "k" });
      const fetchMock = vi.fn().mockResolvedValue({ ...busy, status: 503 });
      vi.stubGlobal("fetch", fetchMock);

      const failed = expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).rejects.toMatchObject({
        status: 502,
      });
      await vi.advanceTimersByTimeAsync(5_000);
      await failed;
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("doesn't start a retry the timeout couldn't fit", async () => {
      vi.useFakeTimers();
      setModel({ model_id: "gemini-x", api_key: "k" });
      // The first answer lands 15 s into the 20 s budget: no room for a retry.
      const fetchMock = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve(busy), 15_000)));
      vi.stubGlobal("fetch", fetchMock);

      const failed = expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).rejects.toMatchObject({
        status: 502,
      });
      await vi.advanceTimersByTimeAsync(15_000);
      await failed;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("keeps the one timeout across a retry", async () => {
      vi.useFakeTimers();
      setModel({ model_id: "gemini-x", api_key: "k" });
      // A 429 at 13.5 s still leaves room for a retry; the retry then stalls,
      // and the 20 s timeout counted from the first attempt cuts it off.
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(busy), 13_500)))
        .mockImplementationOnce(
          (_url: string, init: { signal: AbortSignal }) =>
            new Promise((_resolve, reject) =>
              init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
            ),
        );
      vi.stubGlobal("fetch", fetchMock);

      const failed = expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).rejects.toMatchObject({
        status: 502,
      });
      await vi.advanceTimersByTimeAsync(15_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(5_000);
      await failed;
    });

    it("doesn't retry the Gemini API, whose 429 is a real limit", async () => {
      setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini" });
      const fetchMock = vi.fn().mockResolvedValue(busy);
      vi.stubGlobal("fetch", fetchMock);

      await expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).rejects.toMatchObject({ status: 502 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("calls OpenAI when that provider is selected", async () => {
    setModel({ model_id: "gpt-x", api_key: "k" });
    const fetchMock = openaiOk();
    vi.stubGlobal("fetch", fetchMock);

    const drafts = await parseTransactionsText({ ...OPTS, text: "200 fruits" });
    expect(drafts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("api.openai.com/v1/chat/completions"), expect.anything());
  });

  it("calls Anthropic when that provider is selected", async () => {
    setModel({ model_id: "claude-x", api_key: "k" });
    const fetchMock = anthropicOk();
    vi.stubGlobal("fetch", fetchMock);

    const drafts = await parseTransactionsText({ ...OPTS, text: "200 fruits" });
    expect(drafts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("api.anthropic.com/v1/messages"), expect.anything());
    // Current Claude models reject any temperature but their default.
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(init.body)).not.toHaveProperty("temperature");
  });

  it("routes an OpenAI-compatible provider through a custom base_url", async () => {
    setModel({ model_id: "deepseek-chat", api_key: "k", provider: "openai", base_url: "https://api.deepseek.com" });
    const fetchMock = openaiOk();
    vi.stubGlobal("fetch", fetchMock);

    await parseTransactionsText({ ...OPTS, text: "200 fruits" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("api.deepseek.com/chat/completions"),
      expect.anything(),
    );
  });

  describe("through the Playxoft AI proxy", () => {
    it("sends a Gemini API entry to the proxy with the entry's key and the proxy key", async () => {
      vi.stubEnv("AI_PROXY_KEY", "pxk_test");
      setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini" });
      const fetchMock = geminiOk();
      vi.stubGlobal("fetch", fetchMock);

      await expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).resolves.toHaveLength(1);
      const { url, headers } = sent(fetchMock);
      expect(url).toBe("https://ai-proxy.playxoft.com/api/gemini/v1beta/models/gemini-x:generateContent");
      expect(headers["x-goog-api-key"]).toBe("k");
      expect(headers["x-px-key"]).toBe("pxk_test");
      // A redirect is never followed: it would carry both keys to wherever it points.
      expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe("manual");
    });

    it("keeps a Vertex entry on Vertex with the proxy key set — no proxy key on the wire", async () => {
      vi.stubEnv("AI_PROXY_KEY", "pxk_test");
      setModel({ model_id: "gemini-x", api_key: "k" });
      const fetchMock = geminiOk();
      vi.stubGlobal("fetch", fetchMock);

      await parseTransactionsText({ ...OPTS, text: "200 fruits" });
      expect(sent(fetchMock).url).toBe("https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-x:generateContent");
      expect(sent(fetchMock).headers).not.toHaveProperty("x-px-key");
    });

    it("sends the proxy key only to the proxy's origin, even from a hand-built config", async () => {
      const fetchMock = geminiOk();
      vi.stubGlobal("fetch", fetchMock);
      await callProviderWithUsage({ provider: "vertex", model: "gemini-x", apiKey: "k", proxyKey: "pxk_test" }, "s", "u");
      expect(sent(fetchMock).url).toContain("https://aiplatform.googleapis.com/");
      expect(sent(fetchMock).headers).not.toHaveProperty("x-px-key");

      const openai = openaiOk();
      vi.stubGlobal("fetch", openai);
      await callProviderWithUsage(
        { provider: "openai", model: "grok-x", apiKey: "k", baseUrl: "https://api.x.ai/v1", proxyKey: "pxk_test" },
        "s",
        "u",
      );
      expect(sent(openai).url).toBe("https://api.x.ai/v1/chat/completions");
      expect(sent(openai).headers).not.toHaveProperty("x-px-key");
    });

    it("sends OpenAI and Anthropic to their proxy paths, each with its own key slot", async () => {
      vi.stubEnv("AI_PROXY_KEY", "pxk_test");
      setModel({ model_id: "gpt-x", api_key: "k" });
      const openai = openaiOk();
      vi.stubGlobal("fetch", openai);
      await parseTransactionsText({ ...OPTS, text: "200 fruits" });
      expect(sent(openai).url).toBe("https://ai-proxy.playxoft.com/api/openai/v1/chat/completions");
      expect(sent(openai).headers).toMatchObject({ Authorization: "Bearer k", "x-px-key": "pxk_test" });

      setModel({ model_id: "claude-x", api_key: "k" });
      const anthropic = anthropicOk();
      vi.stubGlobal("fetch", anthropic);
      await parseTransactionsText({ ...OPTS, text: "200 fruits" });
      expect(sent(anthropic).url).toBe("https://ai-proxy.playxoft.com/api/anthropic/v1/messages");
      expect(sent(anthropic).headers).toMatchObject({ "x-api-key": "k", "x-px-key": "pxk_test" });
    });

    it("never sends the proxy key to a base_url host", async () => {
      vi.stubEnv("AI_PROXY_KEY", "pxk_test");
      setModel({ model_id: "grok-x", api_key: "k", provider: "openai", base_url: "https://api.x.ai/v1" });
      const fetchMock = openaiOk();
      vi.stubGlobal("fetch", fetchMock);

      await parseTransactionsText({ ...OPTS, text: "200 fruits" });
      expect(sent(fetchMock).url).toBe("https://api.x.ai/v1/chat/completions");
      expect(sent(fetchMock).headers).not.toHaveProperty("x-px-key");
    });

    it("doesn't retry a proxied 503 itself, and logs the proxy's trace", async () => {
      vi.stubEnv("AI_PROXY_KEY", "pxk_test");
      setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini" });
      const error = vi.spyOn(logger, "error").mockImplementation(() => {});
      // 503 is one a direct Vertex call would retry; through the proxy it's final.
      const fetchMock = vi.fn(async () => ({
        ok: false,
        status: 503,
        headers: new Headers({
          "x-px-request-id": "px-req-1",
          "x-px-attempts": "in:upstream_5xx:503,sg:upstream_5xx:503",
        }),
        json: async () => ({}),
        text: async () => '{"error":{"code":503,"status":"UNAVAILABLE"}}',
      }));
      vi.stubGlobal("fetch", fetchMock);

      await expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).rejects.toMatchObject({ status: 502 });
      // The proxy already tried the next region.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(
        "AI parse request failed with status 503",
        expect.objectContaining({
          event: "ai.parse.http_error",
          provider: "gemini",
          pxRequestId: "px-req-1",
          pxAttempts: "in:upstream_5xx:503,sg:upstream_5xx:503",
        }),
      );
      // Only the proxy's own headers — never a key.
      expect(JSON.stringify(error.mock.calls)).not.toContain("pxk_test");
      error.mockRestore();
    });

    it("logs Google's reason for a refused key, and nothing else from its details", async () => {
      vi.stubEnv("AI_PROXY_KEY", "pxk_test");
      setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini" });
      const error = vi.spyOn(logger, "error").mockImplementation(() => {});
      const body = {
        error: {
          code: 403,
          status: "PERMISSION_DENIED",
          message: "Requests to this API are blocked.",
          details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_SERVICE_BLOCKED", metadata: { consumer: "projects/123" } }],
        },
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: false, status: 403, headers: new Headers({ "x-px-request-id": "px-req-2" }), json: async () => body, text: async () => JSON.stringify(body) })),
      );

      await expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).rejects.toMatchObject({ status: 502 });
      expect(error).toHaveBeenCalledWith(
        "AI parse request failed with status 403",
        expect.objectContaining({ errorStatus: "PERMISSION_DENIED", errorReason: "API_KEY_SERVICE_BLOCKED", pxRequestId: "px-req-2" }),
      );
      expect(JSON.stringify(error.mock.calls)).not.toContain("projects/123");
      error.mockRestore();
    });

    it("logs the proxy's request id when a 200 holds nothing usable", async () => {
      vi.stubEnv("AI_PROXY_KEY", "pxk_test");
      setModel({ model_id: "gemini-x", api_key: "k", provider: "gemini" });
      const error = vi.spyOn(logger, "error").mockImplementation(() => {});
      const reply = (text: string) =>
        vi.fn(async () => ({
          ok: true,
          status: 200,
          headers: new Headers({ "x-px-request-id": "px-req-3" }),
          json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
          text: async () => "",
        }));

      vi.stubGlobal("fetch", reply("no json here"));
      await expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).rejects.toMatchObject({ status: 502 });
      expect(error).toHaveBeenCalledWith(
        "AI parse returned non-JSON",
        expect.objectContaining({ event: "ai.parse.bad_json", pxRequestId: "px-req-3" }),
      );

      vi.stubGlobal("fetch", reply(""));
      await expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).rejects.toMatchObject({ status: 502 });
      expect(error).toHaveBeenCalledWith(
        "AI parse returned no content",
        expect.objectContaining({ event: "ai.parse.empty_response", pxRequestId: "px-req-3" }),
      );
      error.mockRestore();
    });
  });

  it("surfaces an upstream failure as 502", async () => {
    setModel({ model_id: "gemini-x", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, headers: new Headers(), json: async () => ({}), text: async () => "boom" })),
    );
    await expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).rejects.toMatchObject({ status: 502 });
  });
});

describe("parseTransactionsText — usage metadata for the AI ledger", () => {
  const OPTS = { categories: CATEGORIES, currency: "INR", locale: "en-IN", today: TODAY };
  const okBody = wrap([{ type: "expense", amount: 200, title: "Fruits", occurredOn: TODAY }]);
  const reply = (json: unknown) =>
    vi.fn(async () => ({ ok: true, headers: new Headers(), json: async () => json, text: async () => "" }));

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports Gemini's prompt and output tokens, thinking included", async () => {
    setModel({ model_id: "gemini-x", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      reply({
        candidates: [{ content: { parts: [{ text: okBody }] } }],
        usageMetadata: { promptTokenCount: 1180, candidatesTokenCount: 210, thoughtsTokenCount: 15 },
      }),
    );
    const onUsage = vi.fn();
    await parseTransactionsText({ ...OPTS, text: "200 fruits", onUsage });
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 1180, outputTokens: 225, audioMs: null });
  });

  it("reports OpenAI-shaped usage", async () => {
    setModel({ model_id: "gpt-x", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      reply({
        choices: [{ message: { content: okBody } }],
        usage: { prompt_tokens: 900, completion_tokens: 80 },
      }),
    );
    const onUsage = vi.fn();
    await parseTransactionsText({ ...OPTS, text: "200 fruits", onUsage });
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 900, outputTokens: 80, audioMs: null });
  });

  it("reports Anthropic usage", async () => {
    setModel({ model_id: "claude-x", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      reply({
        content: [{ type: "text", text: okBody }],
        usage: { input_tokens: 1000, output_tokens: 90 },
      }),
    );
    const onUsage = vi.fn();
    await parseTransactionsText({ ...OPTS, text: "200 fruits", onUsage });
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 1000, outputTokens: 90, audioMs: null });
  });

  it("stays silent when the provider reports no usage, rather than inventing zeros", async () => {
    setModel({ model_id: "gemini-x", api_key: "k" });
    vi.stubGlobal("fetch", reply({ candidates: [{ content: { parts: [{ text: okBody }] } }] }));
    const onUsage = vi.fn();
    await parseTransactionsText({ ...OPTS, text: "200 fruits", onUsage });
    expect(onUsage).not.toHaveBeenCalled();
  });

  it("ignores junk counts from an untrusted reply", async () => {
    setModel({ model_id: "gemini-x", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      reply({
        candidates: [{ content: { parts: [{ text: okBody }] } }],
        usageMetadata: { promptTokenCount: "lots", candidatesTokenCount: -4 },
      }),
    );
    const onUsage = vi.fn();
    await parseTransactionsText({ ...OPTS, text: "200 fruits", onUsage });
    expect(onUsage).not.toHaveBeenCalled();
  });

  it("reports usage even when the reply yields no drafts — the tokens were still spent", async () => {
    setModel({ model_id: "gemini-x", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      reply({
        candidates: [{ content: { parts: [{ text: wrap([]) }] } }],
        usageMetadata: { promptTokenCount: 1100, candidatesTokenCount: 12 },
      }),
    );
    const onUsage = vi.fn();
    await expect(parseTransactionsText({ ...OPTS, text: "hello", onUsage })).rejects.toMatchObject({
      status: 400,
    });
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 1100, outputTokens: 12, audioMs: null });
  });
});

describe("tag markers", () => {
  const opts = {
    categories: [{ name: "Food", kind: "expense" as const }],
    tags: ["Travel", "Weekly"],
    today: "2026-06-01",
  };

  it("resolves tag names to the workspace's stored casing", () => {
    const [d] = draftsFromRawJson(
      JSON.stringify({
        transactions: [
          { type: "expense", amount: 500, title: "Groceries", tagNames: ["weekly", "TRAVEL"] },
        ],
      }),
      opts,
    );
    // Matched case-insensitively, returned in the casing the workspace stores —
    // the save path looks tags up by name.
    expect(d!.tagNames).toEqual(["Weekly", "Travel"]);
  });

  it("drops a tag the workspace doesn't have, rather than inventing one", () => {
    const [d] = draftsFromRawJson(
      JSON.stringify({
        transactions: [
          { type: "expense", amount: 500, title: "Groceries", tagNames: ["Travel", "Invented"] },
        ],
      }),
      opts,
    );
    // The model is told which names exist; anything else is a hallucination and
    // must not become a tag on the user's transaction.
    expect(d!.tagNames).toEqual(["Travel"]);
  });

  it("dedupes, and caps at the per-transaction limit", () => {
    const many = Array.from({ length: TAGS_PER_TRANSACTION_MAX + 3 }, (_, i) => `t${i}`);
    const [d] = draftsFromRawJson(
      JSON.stringify({
        transactions: [
          { type: "expense", amount: 5, title: "X", tagNames: [...many, ...many] },
        ],
      }),
      { ...opts, tags: many },
    );
    expect(d!.tagNames).toHaveLength(TAGS_PER_TRANSACTION_MAX);
    expect(new Set(d!.tagNames).size).toBe(TAGS_PER_TRANSACTION_MAX);
  });

  it("is an empty array when the model returned none", () => {
    const [d] = draftsFromRawJson(
      JSON.stringify({ transactions: [{ type: "expense", amount: 5, title: "X" }] }),
      opts,
    );
    // Never null: every consumer treats it as a list.
    expect(d!.tagNames).toEqual([]);
  });
});

/**
 * The bug this guards against shipped to production and was invisible in review:
 * the prompt described `tagNames` in detail, the resolver was ready for it, and
 * every response came back without it — because Gemini's `responseSchema` never
 * declared the field, and structured output drops whatever the schema omits.
 * Reading the prompt or the parser told you nothing; only the wire did.
 *
 * So the assertion is derived rather than written down: pull the example object
 * out of the system prompt the request actually carries, and require the schema
 * to declare every key of it. Add a field to one and forget the other, and this
 * fails by construction — which is the only way a second field won't repeat it.
 */
describe("Gemini responseSchema covers every field the prompt asks for", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  /** The slice of Gemini's request body these two tests read. */
  type GeminiRequest = {
    systemInstruction: { parts: Array<{ text: string }> };
    generationConfig: {
      responseSchema: {
        properties: {
          transactions: {
            items: { properties: Record<string, unknown>; required: string[] };
          };
        };
      };
    };
  };

  /** Run one Gemini parse and hand back the request body that went out. */
  async function capturedRequest(): Promise<GeminiRequest> {
    setModel({ model_id: "gemini-x", api_key: "k" });
    let sent: GeminiRequest | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        sent = JSON.parse(init.body);
        return {
          ok: true,
          headers: new Headers(),
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        transactions: [
                          { type: "expense", amount: 1, title: "X", tagNames: [], occurredOn: TODAY },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          text: async () => "",
        };
      }),
    );
    await parseTransactionsText({
      text: "200 fruits",
      categories: CATEGORIES,
      tags: ["Travel"],
      currency: "INR",
      locale: "en-IN",
      today: TODAY,
    });
    if (!sent) throw new Error("no request was sent");
    return sent;
  }

  it("declares every key of the prompt's own example object", async () => {
    const body = await capturedRequest();
    const system: string = body.systemInstruction.parts[0].text;

    // The prompt ends with the literal shape it demands — that line is the
    // contract, so parse it rather than restating the field list here.
    //
    // Anchored to the end and barred from crossing a newline on purpose.
    // `String.match` without /g returns the *first* hit, so an unanchored
    // pattern would happily lock on to some earlier counter-example line and
    // then validate the wrong object — passing while the real last line drifted
    // away from the schema, which is the exact failure this test exists to
    // catch. Reformat the prompt and this goes null, which fails loudly below.
    const example = system.match(/\{"transactions":\[(\{[^\n]*\})\]\}\s*$/);
    expect(example, "the prompt no longer ends with its example object").not.toBeNull();
    const promptKeys = Object.keys(JSON.parse(example![1]!)).sort();

    const schemaKeys = Object.keys(
      body.generationConfig.responseSchema.properties.transactions.items.properties,
    ).sort();

    expect(schemaKeys).toEqual(promptKeys);
  });

  it("asks for the note's own words as the title, never a label the model writes", async () => {
    // Lives here for `capturedRequest`. Until 0.32.0 rule 4 asked for "a short
    // label for the item or merchant (e.g. "Fruits")", and the live model
    // obliged: "Nive dinner A2B Swiggey 254" → "Dinner", "Hello 100" → "General
    // expense". A string check is a weak guard on a prompt, but it is the one
    // that stops that wording from being written back in.
    const system = (await capturedRequest()).systemInstruction.parts[0].text;
    expect(system).toMatch(/title: the item's words EXACTLY as the user wrote them/);
    expect(system).toMatch(/never replace it with a category name or a generic label/);
    expect(system).toMatch(/description: ONLY the text inside an item's parentheses/);
    expect(system).not.toMatch(/short label/i);
  });

  it("carries a tag the model returned all the way to the draft", async () => {
    // The one assertion that would have gone red in 6.3.0. Everything else here
    // checks the *request*; this checks the round trip, so a tag lost anywhere
    // between the adapter's response and `AiParsedDraft` fails the build rather
    // than shipping as "the hashtag does nothing".
    setModel({ model_id: "gemini-x", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      transactions: [
                        {
                          type: "expense",
                          amount: 1200,
                          title: "Flight",
                          tagNames: ["Travel"],
                          occurredOn: TODAY,
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        text: async () => "",
      })),
    );

    const drafts = await parseTransactionsText({
      text: "1200 flight",
      categories: CATEGORIES,
      tags: ["Travel"],
      currency: "INR",
      locale: "en-IN",
      today: TODAY,
    });
    expect(drafts[0]!.tagNames).toEqual(["Travel"]);
  });

  it("puts the workspace's tag list in the prompt", async () => {
    const body = await capturedRequest();
    const system: string = body.systemInstruction.parts[0]!.text;
    // Without this the model is asked for tags and handed no vocabulary, so it
    // returns none — the same "prompt says one thing, wire does another" shape
    // as the schema bug, one layer along, and nothing else here would notice.
    expect(system).toContain('Allowed tags: "Travel"');
  });

  it("requires tagNames, so it arrives as [] instead of going missing", async () => {
    const body = await capturedRequest();
    const items = body.generationConfig.responseSchema.properties.transactions.items;
    expect(items.properties.tagNames).toEqual({
      type: "ARRAY",
      items: { type: "STRING" },
      // The cap has to bound the *reply*, not just the rows kept afterwards:
      // `draftsFromRawJson` trimming to 10 does nothing for the output-token
      // budget the reply was already written against.
      maxItems: TAGS_PER_TRANSACTION_MAX,
    });
    // An optional array is precisely the shape a model leaves out — which is
    // what happened here.
    expect(items.required).toContain("tagNames");
  });
});
