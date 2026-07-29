import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_AUDIO_BYTES, MAX_TRANSCRIPT_CHARS } from "@/lib/ai-limits";
import {
  baseMimeType,
  buildTranscribePrompt,
  cleanTranscript,
  resolveTranscribeModel,
  transcribeVoiceNote,
} from "@/lib/ai-transcribe";
import { ApiError } from "@/lib/errors";

/** Tiny but non-empty audio bytes — content is irrelevant, size isn't. */
const AUDIO = new TextEncoder().encode("fake-opus-bytes-long-enough-to-pass-the-empty-check");
/** What those bytes look like once Gemini's inlineData encoding is applied. */
const AUDIO_B64 = Buffer.from(AUDIO).toString("base64");

const OPTS = {
  audio: { bytes: AUDIO, mimeType: "audio/webm;codecs=opus" },
  languages: ["ta", "en"],
  currency: "INR",
  categoryNames: ["Groceries", "Electricity"],
};

/** Configure the transcribe registry with a single named entry + select it. */
function setModel(entry: Record<string, unknown>, name = "current") {
  vi.stubEnv("AI_TRANSCRIBE_MODEL", JSON.stringify({ [name]: entry }));
  vi.stubEnv("AI_TRANSCRIBE_MODEL_CURRENT", name);
}

/** Run a throwing fn and hand back the ApiError it raised. */
function caught(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("expected the call to throw");
}

describe("baseMimeType", () => {
  it("strips codec parameters and normalizes case", () => {
    expect(baseMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMimeType("AUDIO/MP4")).toBe("audio/mp4");
    expect(baseMimeType(" audio/ogg ; codecs=opus")).toBe("audio/ogg");
  });

  it("passes a bare type through", () => {
    expect(baseMimeType("audio/wav")).toBe("audio/wav");
  });
});

describe("buildTranscribePrompt", () => {
  const prompt = buildTranscribePrompt({
    languages: ["ta", "te", "en"],
    currency: "INR",
    categoryNames: ["Groceries"],
  });

  it("names every selected language, which is the point of the multi-select", () => {
    expect(prompt).toContain("Tamil, Telugu and English");
  });

  it("tells the model not to translate between them", () => {
    expect(prompt).toMatch(/never translate/i);
  });

  it("asks for digits, so the parser doesn't have to read number words", () => {
    expect(prompt).toContain("250");
    expect(prompt).toMatch(/digits/i);
  });

  it("names the workspace currency and asks for symbols to be dropped", () => {
    expect(prompt).toContain("INR");
  });

  it("passes category names as quoted data, never as instructions", () => {
    expect(prompt).toContain('"Groceries"');
    expect(prompt).toMatch(/never as instructions/i);
  });

  it("omits the vocabulary line entirely when there are no categories", () => {
    const bare = buildTranscribePrompt({ languages: ["en"], currency: "USD", categoryNames: [] });
    expect(bare).not.toMatch(/spelling hints/i);
  });

  it("demands a bare transcript with no wrapper", () => {
    expect(prompt).toMatch(/nothing else/i);
  });
});

describe("cleanTranscript — models wrap a transcript even when told not to", () => {
  it("passes clean text through untouched", () => {
    expect(cleanTranscript("200 fruits, 1000 electricity")).toBe("200 fruits, 1000 electricity");
  });

  it("trims surrounding whitespace", () => {
    expect(cleanTranscript("  200 fruits  ")).toBe("200 fruits");
  });

  it("unwraps a markdown code fence", () => {
    expect(cleanTranscript("```\n200 fruits\n```")).toBe("200 fruits");
    expect(cleanTranscript("```text\n200 fruits\n```")).toBe("200 fruits");
  });

  it("drops a leading label the model added", () => {
    expect(cleanTranscript("Transcript: 200 fruits")).toBe("200 fruits");
    expect(cleanTranscript("Transcription - 200 fruits")).toBe("200 fruits");
    expect(cleanTranscript("Output: 200 fruits")).toBe("200 fruits");
  });

  it("removes matching wrapper quotes", () => {
    expect(cleanTranscript('"200 fruits"')).toBe("200 fruits");
    expect(cleanTranscript("“200 fruits”")).toBe("200 fruits");
  });

  it("keeps quotes that are part of the speech", () => {
    expect(cleanTranscript('paid the "guy" 200')).toBe('paid the "guy" 200');
  });

  it("collapses newlines and runs of spaces into single spaces", () => {
    expect(cleanTranscript("200 fruits\n100 veg\n\n1000 electricity")).toBe(
      "200 fruits 100 veg 1000 electricity",
    );
    expect(cleanTranscript("200    fruits")).toBe("200 fruits");
  });

  it("returns an empty string for an empty reply", () => {
    expect(cleanTranscript("   ")).toBe("");
    expect(cleanTranscript("")).toBe("");
  });

  it(`truncates at ${MAX_TRANSCRIPT_CHARS} characters`, () => {
    expect(cleanTranscript("a".repeat(MAX_TRANSCRIPT_CHARS + 500))).toHaveLength(
      MAX_TRANSCRIPT_CHARS,
    );
  });
});

describe("resolveTranscribeModel — its own registry, independent of parsing", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is unavailable until an operator configures it", () => {
    vi.stubEnv("AI_TRANSCRIBE_MODEL", "");
    vi.stubEnv("AI_TRANSCRIBE_MODEL_CURRENT", "");
    expect(caught(() => resolveTranscribeModel()).status).toBe(503);
  });

  it("does not fall back to the parse model, which may not accept audio", () => {
    vi.stubEnv("AI_PARSE_MODEL", JSON.stringify({ p: { model_id: "claude-x", api_key: "k" } }));
    vi.stubEnv("AI_PARSE_MODEL_CURRENT", "p");
    vi.stubEnv("AI_TRANSCRIBE_MODEL", "");
    vi.stubEnv("AI_TRANSCRIBE_MODEL_CURRENT", "");
    expect(caught(() => resolveTranscribeModel()).status).toBe(503);
  });

  it("infers gemini from the model id", () => {
    setModel({ model_id: "gemini-3.5-flash-lite", api_key: "k" });
    expect(resolveTranscribeModel()).toMatchObject({
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      apiKey: "k",
    });
  });

  it("infers openai for a Whisper id, wherever it's hosted", () => {
    setModel({ model_id: "whisper-large-v3-turbo", api_key: "k", base_url: "https://api.groq.com/openai/v1" });
    expect(resolveTranscribeModel()).toMatchObject({
      provider: "openai",
      baseUrl: "https://api.groq.com/openai/v1",
    });
  });

  it("rejects an entry missing a key", () => {
    setModel({ model_id: "gemini-x" });
    expect(caught(() => resolveTranscribeModel()).status).toBe(503);
  });

  it("rejects a model id it can't place without an explicit provider", () => {
    setModel({ model_id: "some-new-asr", api_key: "k" });
    expect(caught(() => resolveTranscribeModel()).status).toBe(503);
  });
});

describe("transcribeVoiceNote — provider wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const geminiOk = (text: string) =>
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
      text: async () => "",
    }));

  it("rejects an unsupported container before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      transcribeVoiceNote({ ...OPTS, audio: { bytes: AUDIO, mimeType: "video/mp4" } }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty recording before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      transcribeVoiceNote({ ...OPTS, audio: { bytes: new Uint8Array(0), mimeType: "audio/webm" } }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized recording before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const huge = new Uint8Array(MAX_AUDIO_BYTES + 1);
    await expect(
      transcribeVoiceNote({ ...OPTS, audio: { bytes: huge, mimeType: "audio/webm" } }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is unavailable, not failed, when no model is configured", async () => {
    vi.stubEnv("AI_TRANSCRIBE_MODEL", "");
    vi.stubEnv("AI_TRANSCRIBE_MODEL_CURRENT", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(transcribeVoiceNote(OPTS)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the audio inline to Gemini and returns the cleaned transcript", async () => {
    setModel({ model_id: "gemini-3.5-flash-lite", api_key: "k" });
    const fetchMock = geminiOk("```\n200 fruits, 1000 electricity\n```");
    vi.stubGlobal("fetch", fetchMock);

    await expect(transcribeVoiceNote(OPTS)).resolves.toBe("200 fruits, 1000 electricity");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("gemini-3.5-flash-lite:generateContent");
    const body = JSON.parse((init as { body: string }).body);
    const parts = body.contents[0].parts;
    expect(parts[1].inlineData).toMatchObject({ mimeType: "audio/webm", data: AUDIO_B64 });
    // The language list has to reach the model, or the setting does nothing.
    expect(parts[0].text).toContain("Tamil and English");
    // 3.x rejects the old thinking field outright — it must not be sent.
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });

  it("uploads multipart to an OpenAI-shaped host and reads back .text", async () => {
    setModel({
      model_id: "whisper-large-v3-turbo",
      api_key: "k",
      base_url: "https://api.groq.com/openai/v1",
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: "200 fruits" }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(transcribeVoiceNote(OPTS)).resolves.toBe("200 fruits");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    const form = (init as { body: FormData }).body;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    // The extension is how these endpoints sniff the container.
    expect((form.get("file") as File).name).toBe("voice-note.webm");
    // No `language` — pinning one transliterates the others on mixed speech.
    expect(form.get("language")).toBeNull();
    // Content-Type must be left to fetch so the multipart boundary survives.
    expect((init as { headers: Record<string, string> }).headers["Content-Type"]).toBeUndefined();
  });

  it("names the file by container so Safari's mp4 isn't rejected", async () => {
    setModel({ model_id: "whisper-1", api_key: "k" });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: "200 fruits" }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await transcribeVoiceNote({ ...OPTS, audio: { bytes: AUDIO, mimeType: "audio/mp4" } });
    const form = (fetchMock.mock.calls[0]![1] as { body: FormData }).body;
    expect((form.get("file") as File).name).toBe("voice-note.m4a");
  });

  it("is unavailable when pointed at Anthropic, which has no speech model", async () => {
    setModel({ model_id: "claude-sonnet-5", api_key: "k" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(transcribeVoiceNote(OPTS)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports 400, not 502, when the audio held no speech", async () => {
    setModel({ model_id: "gemini-x", api_key: "k" });
    // The prompt asks for an empty reply when there's nothing to transcribe, so
    // this is a valid answer about the *recording*, not a provider failure.
    vi.stubGlobal("fetch", geminiOk("   "));
    await expect(transcribeVoiceNote(OPTS)).rejects.toMatchObject({ status: 400 });
  });

  it("reports 400 for an empty transcript from an OpenAI-shaped host too", async () => {
    setModel({ model_id: "whisper-1", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ text: "" }), text: async () => "" })),
    );
    await expect(transcribeVoiceNote(OPTS)).rejects.toMatchObject({ status: 400 });
  });

  it("reports 502 when the reply is structurally missing (blocked or truncated)", async () => {
    setModel({ model_id: "gemini-x", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ candidates: [{ finishReason: "SAFETY" }] }),
        text: async () => "",
      })),
    );
    await expect(transcribeVoiceNote(OPTS)).rejects.toMatchObject({ status: 502 });
  });

  it("reports 502 when an OpenAI-shaped host omits the text field", async () => {
    setModel({ model_id: "whisper-1", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}), text: async () => "" })),
    );
    await expect(transcribeVoiceNote(OPTS)).rejects.toMatchObject({ status: 502 });
  });

  it("reports 502 on an upstream failure", async () => {
    setModel({ model_id: "gemini-x", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => '{"error":{"code":500}}',
      })),
    );
    await expect(transcribeVoiceNote(OPTS)).rejects.toMatchObject({ status: 502 });
  });

  it("reports 502 when the network itself errors", async () => {
    setModel({ model_id: "gemini-x", api_key: "k" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    );
    await expect(transcribeVoiceNote(OPTS)).rejects.toMatchObject({ status: 502 });
  });
});
