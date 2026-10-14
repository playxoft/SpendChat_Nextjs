import { describe, it, expect, vi, beforeEach } from "vitest";

const bucket = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async (key: string, body: ArrayBuffer) => {
    bucket.set(key, new Uint8Array(body));
  }),
  readObject: vi.fn(async (key: string) => bucket.get(key) ?? null),
  deleteObject: vi.fn(async (key: string) => {
    bucket.delete(key);
  }),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
}));

import { GET as listInvoices, POST as createInvoice } from "@/app/api/v1/invoices/route";
import { GET as getInvoice, PATCH as patchInvoice, DELETE as deleteInvoice } from "@/app/api/v1/invoices/[id]/route";
import { POST as finalise } from "@/app/api/v1/invoices/[id]/finalise/route";
import { POST as send } from "@/app/api/v1/invoices/[id]/send/route";
import { POST as voidIt } from "@/app/api/v1/invoices/[id]/void/route";
import { POST as markPaid } from "@/app/api/v1/invoices/[id]/mark-paid/route";
import { POST as convert } from "@/app/api/v1/invoices/[id]/convert/route";
import { GET as pdf } from "@/app/api/v1/invoices/[id]/pdf/route";
import { GET as listShares, POST as createShare } from "@/app/api/v1/invoices/[id]/shares/route";
import { DELETE as revokeShare } from "@/app/api/v1/invoices/[id]/shares/[shareId]/route";
import { GET as listClients, POST as createClient } from "@/app/api/v1/invoice-clients/route";
import {
  DELETE as deleteClient,
  GET as getClient,
  PATCH as patchClient,
} from "@/app/api/v1/invoice-clients/[id]/route";
import { GET as listSellers, POST as createSeller } from "@/app/api/v1/invoice-sellers/route";
import { PATCH as patchSeller } from "@/app/api/v1/invoice-sellers/[id]/route";
import { DELETE as deleteLogo, GET as getLogo, PUT as putLogo } from "@/app/api/v1/invoice-sellers/[id]/logo/route";
import { GET as getUsage } from "@/app/api/v1/usage/route";
import { setSession, signInAs } from "../helpers/session";
import { bootstrapUser, firstProfileId } from "../helpers/seed";
import { apiReq, ctx, jsonBody } from "./helpers";

const MISSING = "00000000-0000-4000-8000-000000000000";

async function json(res: Response) {
  return { status: res.status, body: await res.json() };
}

const body = (profileId: string, extra: Record<string, unknown> = {}) => ({
  kind: "invoice",
  profileId,
  currency: "INR",
  issueDate: "2026-10-01",
  dueDate: "2026-10-31",
  client: { name: "Acme Ltd" },
  seller: { name: "Asha Studio" },
  upiId: "asha@okbank",
  items: [{ description: "Design", quantity: 2, unitPrice: "1250.50" }],
  taxRate: 18,
  ...extra,
});

let P: string;

beforeEach(async () => {
  bucket.clear();
  signInAs("a");
  await bootstrapUser("a");
  P = await firstProfileId("a");
});

describe("/api/v1/invoices", () => {
  it("401s without a token", async () => {
    setSession(null);
    expect((await listInvoices(apiReq("/api/v1/invoices", { auth: false }))).status).toBe(401);
  });

  it("creates a draft, lists, reads, replaces and deletes it", async () => {
    const created = await json(await createInvoice(apiReq("/api/v1/invoices", { method: "POST", body: jsonBody(body(P)) })));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      kind: "invoice",
      status: "draft",
      number: null,
      currency: "INR",
      subtotalMinor: 250100,
      taxMinor: 45018,
      totalMinor: 295118,
      upiId: "asha@okbank",
      items: [{ position: 0, description: "Design", quantity: 2, unitPriceMinor: 125050, amountMinor: 250100 }],
    });
    const id = created.body.data.id as string;

    const list = await json(await listInvoices(apiReq("/api/v1/invoices?kind=invoice&status=draft")));
    expect(list.body.data.map((i: { id: string }) => i.id)).toEqual([id]);
    expect(list.body.data[0]).not.toHaveProperty("items");
    expect((await json(await listInvoices(apiReq("/api/v1/invoices?status=paid")))).body.data).toEqual([]);
    expect((await listInvoices(apiReq("/api/v1/invoices?status=bogus"))).status).toBe(422);

    const one = await json(await getInvoice(apiReq(`/api/v1/invoices/${id}`), ctx({ id })));
    expect(one.body.data.id).toBe(id);

    const patched = await json(
      await patchInvoice(
        apiReq(`/api/v1/invoices/${id}`, { method: "PATCH", body: jsonBody({ ...body(P), taxRate: 0 }) }),
        ctx({ id }),
      ),
    );
    expect(patched.body.data.totalMinor).toBe(250100);

    expect((await json(await deleteInvoice(apiReq(`/api/v1/invoices/${id}`, { method: "DELETE" }), ctx({ id })))).body).toEqual({
      data: { id, deleted: true },
    });
    expect((await getInvoice(apiReq(`/api/v1/invoices/${id}`), ctx({ id }))).status).toBe(404);
    expect((await getInvoice(apiReq(`/api/v1/invoices/${MISSING}`), ctx({ id: MISSING }))).status).toBe(404);
  });

  it("finalises, sends as a link, serves the PDF, refuses delete and voids", async () => {
    const id = (await json(await createInvoice(apiReq("/api/v1/invoices", { method: "POST", body: jsonBody(body(P)) })))).body.data
      .id as string;
    const done = await json(await finalise(apiReq(`/api/v1/invoices/${id}/finalise`, { method: "POST" }), ctx({ id })));
    expect(done.body.data).toMatchObject({ status: "sent", number: "INV-0001", hasPdf: true });
    expect((await finalise(apiReq(`/api/v1/invoices/${id}/finalise`, { method: "POST" }), ctx({ id }))).status).toBe(409);

    const sent = await json(await send(apiReq(`/api/v1/invoices/${id}/send`, { method: "POST" }), ctx({ id })));
    expect(sent.body.data.share.url).toMatch(/^http:\/\/localhost\/share\/invoice\/[A-Za-z0-9_-]{43}$/);

    const res = await pdf(apiReq(`/api/v1/invoices/${id}/pdf?download=1`), ctx({ id }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="INV-0001.pdf"/);
    expect(new TextDecoder().decode(new Uint8Array(await res.arrayBuffer()).slice(0, 5))).toBe("%PDF-");

    const del = await json(await deleteInvoice(apiReq(`/api/v1/invoices/${id}`, { method: "DELETE" }), ctx({ id })));
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("conflict");

    const voided = await json(await voidIt(apiReq(`/api/v1/invoices/${id}/void`, { method: "POST" }), ctx({ id })));
    expect(voided.body.data).toMatchObject({ status: "void", number: "INV-0001" });
  });

  it("marks paid once, in the workspace's currency (amount_required for another)", async () => {
    // A new account's workspace is USD (no geo in tests); this invoice is in rupees.
    const id = (await json(await createInvoice(apiReq("/api/v1/invoices", { method: "POST", body: jsonBody(body(P)) })))).body.data
      .id as string;
    await finalise(apiReq(`/api/v1/invoices/${id}/finalise`, { method: "POST" }), ctx({ id }));
    const missing = await json(await markPaid(apiReq(`/api/v1/invoices/${id}/mark-paid`, { method: "POST" }), ctx({ id })));
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe("amount_required");

    const paid = await json(
      await markPaid(
        apiReq(`/api/v1/invoices/${id}/mark-paid`, { method: "POST", body: jsonBody({ amount: 35.4, paidOn: "2026-10-03" }) }),
        ctx({ id }),
      ),
    );
    expect(paid.body.data).toMatchObject({ alreadyPaid: false, invoice: { status: "paid", paidAmountMinor: 3540 } });
    const again = await json(
      await markPaid(apiReq(`/api/v1/invoices/${id}/mark-paid`, { method: "POST", body: jsonBody({ amount: 35.4 }) }), ctx({ id })),
    );
    expect(again.body.data).toMatchObject({ alreadyPaid: true, transactionId: paid.body.data.transactionId });
  });

  it("turns a quote into a draft invoice", async () => {
    const q = (await json(await createInvoice(apiReq("/api/v1/invoices", { method: "POST", body: jsonBody(body(P, { kind: "quote" })) }))))
      .body.data;
    const converted = await json(await convert(apiReq(`/api/v1/invoices/${q.id}/convert`, { method: "POST" }), ctx({ id: q.id })));
    expect(converted.status).toBe(201);
    expect(converted.body.data).toMatchObject({ kind: "invoice", status: "draft", sourceQuoteId: q.id });
  });

  it("makes, lists and revokes share links; a draft can't be shared", async () => {
    const id = (await json(await createInvoice(apiReq("/api/v1/invoices", { method: "POST", body: jsonBody(body(P)) })))).body.data
      .id as string;
    expect((await createShare(apiReq(`/api/v1/invoices/${id}/shares`, { method: "POST" }), ctx({ id }))).status).toBe(409);
    await finalise(apiReq(`/api/v1/invoices/${id}/finalise`, { method: "POST" }), ctx({ id }));
    const made = await json(
      await createShare(apiReq(`/api/v1/invoices/${id}/shares`, { method: "POST", body: jsonBody({ expiresInDays: 7 }) }), ctx({ id })),
    );
    expect(made.status).toBe(201);
    expect(made.body.data.expiresAt).toMatch(/Z$/);
    const listed = await json(await listShares(apiReq(`/api/v1/invoices/${id}/shares`), ctx({ id })));
    expect(listed.body.data.map((s: { id: string }) => s.id)).toEqual([made.body.data.id]);
    const shareId = made.body.data.id as string;
    expect(
      (await revokeShare(apiReq(`/api/v1/invoices/${id}/shares/${shareId}`, { method: "DELETE" }), ctx({ id, shareId }))).status,
    ).toBe(200);
    expect((await json(await listShares(apiReq(`/api/v1/invoices/${id}/shares`), ctx({ id })))).body.data).toEqual([]);
  });

  it("another person's invoice is a 404 everywhere", async () => {
    const id = (await json(await createInvoice(apiReq("/api/v1/invoices", { method: "POST", body: jsonBody(body(P)) })))).body.data
      .id as string;
    signInAs("b");
    await bootstrapUser("b");
    expect((await getInvoice(apiReq(`/api/v1/invoices/${id}`), ctx({ id }))).status).toBe(404);
    expect((await finalise(apiReq(`/api/v1/invoices/${id}/finalise`, { method: "POST" }), ctx({ id }))).status).toBe(404);
    expect((await pdf(apiReq(`/api/v1/invoices/${id}/pdf`), ctx({ id }))).status).toBe(404);
    expect((await json(await createInvoice(apiReq("/api/v1/invoices", { method: "POST", body: jsonBody(body(P)) })))).status).toBe(404);
  });
});

describe("/api/v1/invoice-clients and /api/v1/invoice-sellers", () => {
  it("clients: create, list, read, change, delete", async () => {
    const made = await json(
      await createClient(apiReq("/api/v1/invoice-clients", { method: "POST", body: jsonBody({ profileId: P, name: "Acme", email: "A@Acme.test" }) })),
    );
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ name: "Acme", email: "a@acme.test", address: null });
    const id = made.body.data.id as string;
    expect((await json(await listClients(apiReq(`/api/v1/invoice-clients?profileId=${P}`)))).body.data).toHaveLength(1);
    expect((await json(await getClient(apiReq(`/api/v1/invoice-clients/${id}`), ctx({ id })))).body.data.id).toBe(id);
    const changed = await json(
      await patchClient(apiReq(`/api/v1/invoice-clients/${id}`, { method: "PATCH", body: jsonBody({ taxId: "GST123" }) }), ctx({ id })),
    );
    expect(changed.body.data.taxId).toBe("GST123");
    expect((await deleteClient(apiReq(`/api/v1/invoice-clients/${id}`, { method: "DELETE" }), ctx({ id }))).status).toBe(200);
    expect((await getClient(apiReq(`/api/v1/invoice-clients/${id}`), ctx({ id }))).status).toBe(404);
    const bad = await json(
      await createClient(apiReq("/api/v1/invoice-clients", { method: "POST", body: jsonBody({ profileId: P, name: "X", email: "nope" }) })),
    );
    expect(bad.status).toBe(422);
  });

  it("sellers: one on the free tier, a UPI id check, and the logo upload", async () => {
    const made = await json(
      await createSeller(apiReq("/api/v1/invoice-sellers", { method: "POST", body: jsonBody({ profileId: P, name: "Asha", upiId: "asha@okbank" }) })),
    );
    expect(made.body.data).toMatchObject({ name: "Asha", upiId: "asha@okbank", hasLogo: false });
    const id = made.body.data.id as string;
    const second = await json(
      await createSeller(apiReq("/api/v1/invoice-sellers", { method: "POST", body: jsonBody({ profileId: P, name: "Two" }) })),
    );
    expect(second.status).toBe(403);
    expect(second.body.error).toMatchObject({ code: "plan_limit", details: { limit: "invoiceSellers" } });
    const badUpi = await patchSeller(
      apiReq(`/api/v1/invoice-sellers/${id}`, { method: "PATCH", body: jsonBody({ upiId: "not a upi" }) }),
      ctx({ id }),
    );
    expect(badUpi.status).toBe(422);
    expect((await json(await listSellers(apiReq("/api/v1/invoice-sellers")))).body.data).toHaveLength(1);

    expect((await getLogo(apiReq(`/api/v1/invoice-sellers/${id}/logo`), ctx({ id }))).status).toBe(404);
    const png = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
      (c) => c.charCodeAt(0),
    );
    const put = await json(
      await putLogo(
        apiReq(`/api/v1/invoice-sellers/${id}/logo`, { method: "PUT", body: png, headers: { "content-type": "image/png" } }),
        ctx({ id }),
      ),
    );
    expect(put.body.data.hasLogo).toBe(true);
    const url = await json(await getLogo(apiReq(`/api/v1/invoice-sellers/${id}/logo`), ctx({ id })));
    expect(url.body.data).toMatchObject({ contentType: "image/png", expiresInSeconds: 300 });
    expect(url.body.data.url).toMatch(/^https:\/\/signed\.example\/invoice-logos\//);
    const notImage = await putLogo(
      apiReq(`/api/v1/invoice-sellers/${id}/logo`, { method: "PUT", body: "<svg/>", headers: { "content-type": "image/png" } }),
      ctx({ id }),
    );
    expect(notImage.status).toBe(422);
    expect((await json(await deleteLogo(apiReq(`/api/v1/invoice-sellers/${id}/logo`, { method: "DELETE" }), ctx({ id })))).body.data.hasLogo).toBe(
      false,
    );
  });
});

describe("/api/v1/usage — invoicing and the storage breakdown (6.13.0)", () => {
  it("reports the invoice allowances and where storage goes", async () => {
    const id = (await json(await createInvoice(apiReq("/api/v1/invoices", { method: "POST", body: jsonBody(body(P)) })))).body.data
      .id as string;
    await finalise(apiReq(`/api/v1/invoices/${id}/finalise`, { method: "POST" }), ctx({ id }));
    const { data } = (await json(await getUsage(apiReq("/api/v1/usage")))).body;
    expect(data.invoicing).toEqual({
      tier: "free",
      perMonth: { used: 1, limit: 20, resetsAt: expect.stringMatching(/Z$/) },
      clients: { used: 0, limit: 20 },
      sellers: { used: 0, limit: 1 },
      templates: 5,
      footer: true,
    });
    expect(data.storage.breakdown).toMatchObject({ files: 0, attachments: 0, quotations: 0, logos: 0 });
    expect(data.storage.breakdown.invoices).toBeGreaterThan(0);
    expect(data.storage.usedBytes).toBe(data.storage.breakdown.invoices);
  });
});
