import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { deleteObjects } from "@/lib/r2";

/**
 * The sweep behind a profile/folder delete. It used to be one signed DELETE per
 * object, sequentially and uncapped: a profile holding 800 files with previews
 * meant ~1600 round-trips, past the Workers subrequest ceiling (50 free / 1000
 * paid) and well past the request's time budget — so the objects stayed in the
 * bucket and the caller got an error for a delete that had already committed.
 */

const ENV = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "akid",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
  R2_PUBLIC_BASE_URL: "https://files.example",
};

type Call = { url: string; method: string; body: string };

let calls: Call[];
let respond: () => Response;

beforeEach(() => {
  Object.assign(process.env, ENV);
  calls = [];
  respond = () => new Response(null, { status: 204 });
  vi.stubGlobal("fetch", async (input: Request | string, init?: RequestInit) => {
    const req = typeof input === "string" ? null : input;
    calls.push({
      url: req ? req.url : input,
      method: (req ? req.method : init?.method) ?? "GET",
      body: req ? await req.text() : String(init?.body ?? ""),
    });
    return respond();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(ENV)) delete process.env[key as keyof typeof ENV];
});

const batches = () => calls.filter((c) => c.method === "POST");
const singles = () => calls.filter((c) => c.method === "DELETE");

describe("deleteObjects", () => {
  it("sweeps many objects in one multi-object delete", async () => {
    await deleteObjects(["a/1.pdf", "a/1_thumb.webp", "a/2.pdf"]);

    expect(calls).toHaveLength(1);
    const [batch] = batches();
    expect(batch.url).toContain("?delete");
    expect(batch.body).toContain("<Key>a/1.pdf</Key>");
    expect(batch.body).toContain("<Key>a/1_thumb.webp</Key>");
    expect(batch.body).toContain("<Key>a/2.pdf</Key>");
  });

  it("collapses duplicates and ignores the null thumbnail slots", async () => {
    await deleteObjects(["a/1.pdf", null, "a/1.pdf", undefined, "a/2.pdf", ""]);

    const [batch] = batches();
    expect(batch.body.match(/<Key>/g)).toHaveLength(2);
  });

  it("splits past the API's 1000-key limit", async () => {
    await deleteObjects(Array.from({ length: 1500 }, (_, i) => `k/${i}`));

    expect(batches()).toHaveLength(2);
    expect(batches()[0]!.body.match(/<Key>/g)).toHaveLength(1000);
    expect(batches()[1]!.body.match(/<Key>/g)).toHaveLength(500);
  });

  it("sends a lone key as a plain DELETE, not a one-item batch", async () => {
    await deleteObjects([null, "a/only.pdf"]);

    expect(batches()).toHaveLength(0);
    expect(singles()).toHaveLength(1);
    expect(singles()[0]!.url).toContain("a/only.pdf");
  });

  it("retries individually when the batch call fails, and bounds the retry", async () => {
    respond = () => new Response("nope", { status: 400 });
    await deleteObjects(Array.from({ length: 200 }, (_, i) => `k/${i}`));

    // One batch attempt, then key-by-key — but only up to the budget, so a
    // bucket that can't batch still can't flood the subrequest allowance.
    expect(batches()).toHaveLength(1);
    expect(singles()).toHaveLength(100);
  });

  it("does nothing without R2 configured, or with nothing to delete", async () => {
    await deleteObjects([]);
    await deleteObjects([null, undefined]);
    expect(calls).toHaveLength(0);

    delete process.env.R2_BUCKET;
    await deleteObjects(["a/1.pdf", "a/2.pdf"]);
    expect(calls).toHaveLength(0);
  });
});
