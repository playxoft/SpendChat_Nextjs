import { describe, it, expect } from "vitest";
import { GET as listTxns, POST as createTxn } from "@/app/api/v1/transactions/route";
import {
  GET as getTxn,
  PATCH as patchTxn,
  DELETE as deleteTxn,
} from "@/app/api/v1/transactions/[id]/route";
import { POST as bulkTxns } from "@/app/api/v1/transactions/bulk/route";
import { setSession, signInAs, uid } from "../helpers/session";
import { bootstrapUser, categoryId, firstProfileId, insertTxn } from "../helpers/seed";
import { apiReq, jsonBody, ctx } from "./helpers";

const base = { type: "expense" as const, amount: 12.5, occurredOn: "2026-06-01" };

describe("/api/v1/transactions", () => {
  it("401s without a token", async () => {
    setSession(null);
    const res = await listTxns(apiReq("/api/v1/transactions", { auth: false }));
    expect(res.status).toBe(401);
  });

  it("creates a transaction and returns it serialized (201)", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await createTxn(
      apiReq("/api/v1/transactions", { method: "POST", body: jsonBody({ ...base, title: "Lunch" }) }),
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.amountMinor).toBe(1250);
    expect(data.amount).toBe("12.50");
    expect(data.title).toBe("Lunch");
    expect(data.type).toBe("expense");
    expect(data.profile.id).toBeTruthy();
  });

  it("422s on invalid input", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await createTxn(
      apiReq("/api/v1/transactions", { method: "POST", body: jsonBody({ ...base, amount: 0 }) }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("validation_error");
    expect(body.error.message).toMatch(/greater than 0/);
  });

  it("400s on malformed JSON", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await createTxn(apiReq("/api/v1/transactions", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
  });

  it("lists newest-first with total + currency meta and honours filters", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await insertTxn("a", { type: "expense", amountMinor: 1000, occurredOn: "2026-06-01" });
    await insertTxn("a", { type: "income", amountMinor: 5000, occurredOn: "2026-06-15" });

    const all = await listTxns(apiReq("/api/v1/transactions"));
    const body = await all.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].occurredOn).toBe("2026-06-15"); // newest first
    expect(body.meta.total).toBe(2);
    expect(body.meta.currency).toEqual({ code: "USD", symbol: "$", decimals: 2 });

    const income = await listTxns(apiReq("/api/v1/transactions?type=income"));
    const incomeBody = await income.json();
    expect(incomeBody.data).toHaveLength(1);
    expect(incomeBody.data[0].type).toBe("income");
  });

  it("gets, updates and deletes a single transaction", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const id = await insertTxn("a", { type: "expense", amountMinor: 500, occurredOn: "2026-06-01" });

    const got = await getTxn(apiReq(`/api/v1/transactions/${id}`), ctx({ id }));
    expect(got.status).toBe(200);

    const patched = await patchTxn(
      apiReq(`/api/v1/transactions/${id}`, {
        method: "PATCH",
        body: jsonBody({ type: "income", amount: 9, occurredOn: "2026-06-02", title: "Refund" }),
      }),
      ctx({ id }),
    );
    expect(patched.status).toBe(200);
    const { data } = await patched.json();
    expect(data.type).toBe("income");
    expect(data.amountMinor).toBe(900);
    expect(data.title).toBe("Refund");

    const del = await deleteTxn(apiReq(`/api/v1/transactions/${id}`, { method: "DELETE" }), ctx({ id }));
    expect(del.status).toBe(200);
    expect((await del.json()).data.deleted).toBe(true);

    const gone = await getTxn(apiReq(`/api/v1/transactions/${id}`), ctx({ id }));
    expect(gone.status).toBe(404);
  });

  it("404s when updating another user's transaction", async () => {
    signInAs("a");
    await bootstrapUser("a");
    await bootstrapUser("b");
    const victim = await insertTxn("b", { type: "expense", amountMinor: 500, occurredOn: "2026-06-01" });
    const res = await patchTxn(
      apiReq(`/api/v1/transactions/${victim}`, {
        method: "PATCH",
        body: jsonBody({ type: "income", amount: 1, occurredOn: "2026-06-02" }),
      }),
      ctx({ id: victim }),
    );
    expect(res.status).toBe(404);
  });

  it("bulk-inserts validated items and 422s on an empty batch", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const profileId = await firstProfileId("a");
    const cat = await categoryId("a", "Groceries", "expense");

    const ok = await bulkTxns(
      apiReq("/api/v1/transactions/bulk", {
        method: "POST",
        body: jsonBody({
          items: [
            { type: "expense", amount: 5, occurredOn: "2026-06-01", categoryId: cat, profileId },
            { type: "income", amount: 20, occurredOn: "2026-06-02" },
          ],
        }),
      }),
    );
    expect(ok.status).toBe(201);
    expect((await ok.json()).data.count).toBe(2);

    const empty = await bulkTxns(
      apiReq("/api/v1/transactions/bulk", { method: "POST", body: jsonBody({ items: [] }) }),
    );
    expect(empty.status).toBe(422);
  });
});

describe("workspace scoping on /api/v1/transactions/{id}", () => {
  it("404s for a transaction that lives in another of the user's workspaces", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const id = await insertTxn("a", {
      type: "expense",
      amountMinor: 500,
      occurredOn: "2026-06-01",
    });
    const { createWorkspaceWithDefaults } = await import("@/lib/workspaces");
    const other = await createWorkspaceWithDefaults(uid("a"), "Second");

    // The row belongs to the default workspace; addressing it under "Second"
    // must read as absent for GET, PATCH and DELETE alike.
    const got = await getTxn(
      apiReq(`/api/v1/transactions/${id}`, { headers: { "x-workspace-id": other.id } }),
      ctx({ id }),
    );
    expect(got.status).toBe(404);

    const patched = await patchTxn(
      apiReq(`/api/v1/transactions/${id}`, {
        method: "PATCH",
        headers: { "x-workspace-id": other.id },
        body: jsonBody({ type: "expense", amount: 9, occurredOn: "2026-06-02" }),
      }),
      ctx({ id }),
    );
    expect(patched.status).toBe(404);

    const deleted = await deleteTxn(
      apiReq(`/api/v1/transactions/${id}`, {
        method: "DELETE",
        headers: { "x-workspace-id": other.id },
      }),
      ctx({ id }),
    );
    expect(deleted.status).toBe(404);

    // Under its own workspace the row is still there, unmodified.
    const same = await getTxn(apiReq(`/api/v1/transactions/${id}`), ctx({ id }));
    expect(same.status).toBe(200);
    const { data } = await same.json();
    expect(data.amountMinor).toBe(500);
  });
});

describe("?tags= on /api/v1/transactions", () => {
  /** Create a tag through the service and return its id. */
  async function makeTag(alias: string, name: string) {
    const { createTxnTag } = await import("@/services/tags");
    const { workspaceIdOf } = await import("../helpers/seed");
    return (await createTxnTag(uid(alias), await workspaceIdOf(alias), { name, color: "#ef4444" }))
      .id;
  }

  const titles = async (qs: string) => {
    const res = await listTxns(apiReq(`/api/v1/transactions${qs}`));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    return (data as { title: string }[]).map((r) => r.title).sort();
  };

  it("filters by tag, matching ANY of them, and embeds the tags on each row", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const travel = await makeTag("a", "Travel");
    const work = await makeTag("a", "Work");

    const mk = (title: string, tagIds: string[]) =>
      createTxn(
        apiReq("/api/v1/transactions", {
          method: "POST",
          body: jsonBody({ ...base, title, tagIds }),
        }),
      );
    await mk("flight", [travel]);
    await mk("laptop", [work]);
    await mk("hotel", [travel, work]);
    await mk("plain", []);

    expect(await titles(`?tags=${travel}`)).toEqual(["flight", "hotel"]);
    // Two tags widen rather than narrow, and a row carrying both appears once.
    expect(await titles(`?tags=${travel},${work}`)).toEqual(["flight", "hotel", "laptop"]);
    expect(await titles("")).toHaveLength(4);

    const res = await listTxns(apiReq(`/api/v1/transactions?tags=${travel}`));
    const { data } = await res.json();
    const hotel = (data as { title: string; tags: { name: string }[] }[]).find(
      (r) => r.title === "hotel",
    );
    expect(hotel!.tags.map((t) => t.name)).toEqual(["Travel", "Work"]);
  });

  // A filter is a view: a mangled URL should narrow oddly, not 500. This is the
  // behaviour the spec now documents, so it is worth pinning at the API edge and
  // not only at the parser.
  it("is forgiving about junk rather than erroring", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const travel = await makeTag("a", "Travel");
    await createTxn(
      apiReq("/api/v1/transactions", {
        method: "POST",
        body: jsonBody({ ...base, title: "flight", tagIds: [travel] }),
      }),
    );

    // Junk alongside a real id keeps the real one.
    expect(await titles(`?tags=${travel},not-a-uuid,`)).toEqual(["flight"]);
    // All junk, or empty, is the same as no filter at all.
    expect(await titles("?tags=nope,also-nope")).toEqual(["flight"]);
    expect(await titles("?tags=")).toEqual(["flight"]);
  });

  it("does not leak another workspace's tag as a filter", async () => {
    signInAs("b");
    await bootstrapUser("b");
    const theirs = await makeTag("b", "Theirs");

    signInAs("a");
    await bootstrapUser("a");
    await createTxn(
      apiReq("/api/v1/transactions", { method: "POST", body: jsonBody({ ...base, title: "mine" }) }),
    );
    // A well-formed id from elsewhere simply matches nothing here.
    expect(await titles(`?tags=${theirs}`)).toEqual([]);
  });
});
