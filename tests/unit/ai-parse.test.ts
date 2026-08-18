import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
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

/** Configure the registry with a single named entry + select it. */
function setModel(entry: Record<string, unknown>, name = "current") {
  vi.stubEnv("AI_PARSE_MODEL", JSON.stringify({ [name]: entry }));
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

describe("resolveModel — env registry + current selector, no models in code", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws 503 when either env var is unset", () => {
    vi.stubEnv("AI_PARSE_MODEL", "");
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "");
    expect(caught(() => resolveModel()).status).toBe(503);

    vi.stubEnv("AI_PARSE_MODEL", JSON.stringify({ x: { model_id: "gemini-x", api_key: "k" } }));
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "");
    expect(caught(() => resolveModel()).status).toBe(503);
  });

  it("throws 503 when the registry isn't a JSON object", () => {
    vi.stubEnv("AI_PARSE_MODEL", "not json");
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "x");
    expect(caught(() => resolveModel()).status).toBe(503);

    vi.stubEnv("AI_PARSE_MODEL", JSON.stringify(["gemini-x"]));
    expect(caught(() => resolveModel()).status).toBe(503);
  });

  it("throws 503 when the current name names no entry", () => {
    vi.stubEnv("AI_PARSE_MODEL", JSON.stringify({ a: { model_id: "gemini-x", api_key: "k" } }));
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "b");
    expect(caught(() => resolveModel()).status).toBe(503);
  });

  it("throws 503 when the entry is missing model_id or api_key", () => {
    setModel({ model_id: "gemini-x" });
    expect(caught(() => resolveModel()).status).toBe(503);
    setModel({ api_key: "k" });
    expect(caught(() => resolveModel()).status).toBe(503);
  });

  it("infers the provider from the model id", () => {
    setModel({ model_id: "gemini-2.5-flash", api_key: "k" });
    expect(resolveModel()).toMatchObject({ provider: "gemini", model: "gemini-2.5-flash", apiKey: "k" });
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

  it("accepts camelCase field aliases (model / apiKey / baseUrl)", () => {
    setModel({ model: "gemini-x", apiKey: "k", baseUrl: "https://example.test" });
    expect(resolveModel()).toMatchObject({ provider: "gemini", model: "gemini-x", apiKey: "k", baseUrl: "https://example.test" });
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
      json: async () => ({ candidates: [{ content: { parts: [{ text: okBody }] } }] }),
      text: async () => "",
    }));
  const openaiOk = () =>
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: okBody } }] }),
      text: async () => "",
    }));
  const anthropicOk = () =>
    vi.fn(async () => ({
      ok: true,
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
    await expect(parseTransactionsText({ ...OPTS, text: "x".repeat(2001) })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 when nothing is configured", async () => {
    vi.stubEnv("AI_PARSE_MODEL", "");
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "");
    vi.stubGlobal("fetch", vi.fn());
    await expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).rejects.toMatchObject({ status: 503 });
  });

  it("calls Gemini and returns validated drafts", async () => {
    setModel({ model_id: "gemini-x", api_key: "k" });
    const fetchMock = geminiOk();
    vi.stubGlobal("fetch", fetchMock);

    const drafts = await parseTransactionsText({ ...OPTS, text: "200 fruits" });
    expect(drafts[0]).toMatchObject({ amount: 200, title: "Fruits", categoryName: "Groceries" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("generativelanguage.googleapis.com"),
      expect.anything(),
    );
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

  it("surfaces an upstream failure as 502", async () => {
    setModel({ model_id: "gemini-x", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => "boom" })),
    );
    await expect(parseTransactionsText({ ...OPTS, text: "200 fruits" })).rejects.toMatchObject({ status: 502 });
  });
});
