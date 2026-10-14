import { describe, it, expect, vi, beforeEach } from "vitest";

// The R2 edge, as an in-memory bucket: what's uploaded can be read back.
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
  deleteObjects: vi.fn(async (keys: (string | null)[]) => {
    for (const k of keys) if (k) bucket.delete(k);
  }),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import {
  invoiceCounters,
  invoices,
  profileOverrides,
  profiles,
  spaceMembers,
  transactions,
  workspaceMembers,
  workspaces,
  type SpaceRole,
  type WorkspaceRole,
} from "@/db/schema";
import { getAddLimits, getUsage } from "@/lib/entitlements";
import { ApiError } from "@/lib/errors";
import { INVOICE_LIMITS } from "@/lib/plans";
import { getStorageBreakdown, getTrashBytes, getWorkspaceStorageUsage } from "@/lib/queries";
import {
  convertQuote,
  createClient,
  createInvoice,
  createInvoiceShare,
  createSeller,
  deleteClient,
  deleteInvoice,
  finaliseInvoice,
  getInvoice,
  getInvoicePdf,
  getSharedInvoicePdf,
  importInvoiceDraft,
  listClients,
  listInvoices,
  listInvoiceShares,
  markInvoicePaid,
  resolveInvoiceShare,
  revokeInvoiceShare,
  sendInvoiceAsLink,
  setSellerLogo,
  updateInvoice,
  voidInvoice,
} from "@/services/invoices";
import { deleteProfile } from "@/services/profiles";
import { deleteFromTrash, restoreFromTrash } from "@/services/trash";
import { uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import {
  bootstrapUser,
  categoryId,
  defaultSpaceIdOf,
  firstProfileId,
  registerUser,
  setWorkspacePlan,
  workspaceIdOf,
} from "./helpers/seed";
import { seedProfile } from "./helpers/vault-seed";

/**
 * Invoices and quotes through the service layer: who sees and changes what,
 * the number series, the free tier's limits, the never-delete-sent rule,
 * "Mark as paid", share links, the stored PDF and the trash.
 */

const db = () => getTestDb();

let W: string;
let P: string;
const A = () => uid("adm");

/** A small, valid draft body. */
function content(overrides: Record<string, unknown> = {}) {
  return {
    currency: "USD",
    issueDate: "2026-10-01",
    dueDate: "2026-10-31",
    client: { name: "Acme Ltd", email: "billing@acme.test" },
    seller: { name: "Asha Studio", contact: "asha@studio.test" },
    items: [
      { description: "Design", quantity: 3, unitPrice: 125.5 },
      { description: "Hosting", quantity: 1, unitPrice: 20 },
    ],
    taxLabel: "GST",
    taxRate: 18,
    ...overrides,
  };
}

async function newDraft(kind: "invoice" | "quote" = "invoice", overrides: Record<string, unknown> = {}, who = A(), profileId = P) {
  return createInvoice(who, W, { kind, profileId, ...content(overrides) });
}

async function expectApiError(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).status).toBe(status);
  if (code) expect((err as ApiError).code).toBe(code);
  return err as ApiError;
}

/** A workspace member with a role in the default space. */
async function member(alias: string, role: WorkspaceRole, spaceRole: SpaceRole | null) {
  await registerUser(alias);
  await db().insert(workspaceMembers).values({ workspaceId: W, userId: uid(alias), role });
  if (spaceRole) {
    await db().insert(spaceMembers).values({ spaceId: await defaultSpaceIdOf(W), userId: uid(alias), role: spaceRole });
  }
  return uid(alias);
}

beforeEach(async () => {
  bucket.clear();
  await bootstrapUser("adm");
  W = await workspaceIdOf("adm");
  P = await firstProfileId("adm");
});

describe("drafts — totals worked out on the server", () => {
  it("stores minor units with the generator's engine, and the lines in order", async () => {
    const inv = await newDraft();
    expect(inv).toMatchObject({
      kind: "invoice",
      status: "draft",
      number: null,
      currency: "USD",
      subtotalMinor: 39650,
      taxMinor: 7137,
      totalMinor: 46787,
      template: "classic",
      showCredit: true,
    });
    expect(inv.items.map((i) => [i.position, i.description, i.quantity, i.unitPriceMinor, i.amountMinor])).toEqual([
      [0, "Design", 3, 12550, 37650],
      [1, "Hosting", 1, 2000, 2000],
    ]);
  });

  it("replaces the whole content on save, and refuses a due date before the issue date", async () => {
    const inv = await newDraft();
    const updated = await updateInvoice(A(), W, inv.id, content({ items: [{ description: "One", quantity: 2, unitPrice: 10 }], taxRate: 0 }));
    expect(updated.items).toHaveLength(1);
    expect(updated.totalMinor).toBe(2000);
    await expectApiError(updateInvoice(A(), W, inv.id, content({ dueDate: "2026-09-01" })), 422);
  });

  it("fills the snapshot from a saved client and seller in the same profile, and refuses ones from elsewhere", async () => {
    const client = await createClient(A(), W, { profileId: P, name: "Priya & Co.", taxId: "29ABCDE1234F1Z5" });
    const seller = await createSeller(A(), W, { profileId: P, name: "Asha Studio", upiId: "asha@okbank" });
    const inv = await newDraft("invoice", { clientId: client.id, client: { name: "" }, sellerId: seller.id, seller: { name: "" } });
    expect(inv.client).toMatchObject({ name: "Priya & Co.", taxId: "29ABCDE1234F1Z5" });
    expect(inv.seller.name).toBe("Asha Studio");
    expect(inv.upiId).toBe("asha@okbank");

    const other = await seedProfile("adm", "Work");
    await expectApiError(newDraft("invoice", { clientId: client.id }, A(), other), 422);
  });
});

describe("access — the profile's rules", () => {
  it("viewers read, editors write, everyone else gets a 404", async () => {
    const inv = await newDraft();
    const vw = await member("vw", "viewer", "viewer");
    const ed = await member("ed", "editor", "editor");
    const none = await member("none", "editor", null);

    expect((await getInvoice(vw, W, inv.id))?.id).toBe(inv.id);
    expect((await listInvoices(vw, W)).map((i) => i.id)).toEqual([inv.id]);
    await expectApiError(updateInvoice(vw, W, inv.id, content()), 403);
    await expectApiError(finaliseInvoice(vw, W, inv.id), 403);
    await expectApiError(newDraft("invoice", {}, vw), 403);

    expect((await updateInvoice(ed, W, inv.id, content({ notes: "Thanks" }))).notes).toBe("Thanks");

    expect(await getInvoice(none, W, inv.id)).toBeNull();
    expect(await listInvoices(none, W)).toEqual([]);
    await expectApiError(finaliseInvoice(none, W, inv.id), 404);
  });

  it("an override that hides the profile hides its invoices", async () => {
    const inv = await newDraft();
    const hid = await member("hid", "editor", "editor");
    await db().insert(profileOverrides).values({ profileId: P, userId: hid, access: "none" });
    expect(await getInvoice(hid, W, inv.id)).toBeNull();
    await expectApiError(voidInvoice(hid, W, inv.id), 404);
  });

  it("another workspace's invoice is a 404", async () => {
    const inv = await newDraft();
    await bootstrapUser("str");
    const theirs = await workspaceIdOf("str");
    expect(await getInvoice(uid("str"), theirs, inv.id)).toBeNull();
    expect(await getInvoice(uid("str"), W, inv.id)).toBeNull();
    await expectApiError(finaliseInvoice(uid("str"), theirs, inv.id), 404);
    expect(await deleteInvoice(uid("str"), W, inv.id)).toBe(false);
  });
});

describe("numbering — per workspace and kind, no gaps, no duplicates", () => {
  it("numbers at finalise: INV-0001, INV-0002…, and quotes in their own series", async () => {
    const a = await newDraft();
    const q = await newDraft("quote");
    const b = await newDraft();
    expect((await finaliseInvoice(A(), W, b.id)).number).toBe("INV-0001");
    expect((await finaliseInvoice(A(), W, q.id)).number).toBe("QUO-0001");
    expect((await finaliseInvoice(A(), W, a.id)).number).toBe("INV-0002");
    await expectApiError(finaliseInvoice(A(), W, a.id), 409);
  });

  it("concurrent finalises get consecutive, distinct numbers", async () => {
    const drafts = [];
    for (let i = 0; i < 8; i++) drafts.push(await newDraft());
    const done = await Promise.all(drafts.map((d) => finaliseInvoice(A(), W, d.id)));
    expect(done.map((d) => d.number).sort()).toEqual(
      ["INV-0001", "INV-0002", "INV-0003", "INV-0004", "INV-0005", "INV-0006", "INV-0007", "INV-0008"],
    );
    const [counter] = await db().select().from(invoiceCounters).where(eq(invoiceCounters.workspaceId, W));
    expect(counter).toMatchObject({ kind: "invoice", lastNumber: 8 });
  });

  it("concurrent finalises of the same draft give it one number", async () => {
    const d = await newDraft();
    const results = await Promise.allSettled([finaliseInvoice(A(), W, d.id), finaliseInvoice(A(), W, d.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [counter] = await db().select().from(invoiceCounters).where(eq(invoiceCounters.workspaceId, W));
    expect(counter!.lastNumber).toBe(1);
  });

  it("deleting a draft leaves no gap, and each workspace has its own series", async () => {
    const gone = await newDraft();
    const kept = await newDraft();
    expect(await deleteInvoice(A(), W, gone.id)).toBe(true);
    expect((await finaliseInvoice(A(), W, kept.id)).number).toBe("INV-0001");

    await bootstrapUser("two");
    const W2 = await workspaceIdOf("two");
    const P2 = await firstProfileId("two");
    const theirs = await createInvoice(uid("two"), W2, { kind: "invoice", profileId: P2, ...content() });
    expect((await finaliseInvoice(uid("two"), W2, theirs.id)).number).toBe("INV-0001");
  });

  it("the schema refuses a duplicate number, or a numbered draft", async () => {
    const a = await finaliseInvoice(A(), W, (await newDraft()).id);
    const b = await newDraft();
    await expect(
      db().update(invoices).set({ status: "sent", number: a.number, numberSeq: 1 }).where(eq(invoices.id, b.id)),
    ).rejects.toThrow();
    await expect(db().update(invoices).set({ number: "INV-0099", numberSeq: 99 }).where(eq(invoices.id, b.id))).rejects.toThrow();
  });
});

describe("a finalised document is never deleted", () => {
  it("drafts delete; sent ones refuse and are voided instead, keeping their number", async () => {
    const draft = await newDraft();
    expect(await deleteInvoice(A(), W, draft.id)).toBe(true);
    expect(await getInvoice(A(), W, draft.id)).toBeNull();

    const sent = await finaliseInvoice(A(), W, (await newDraft()).id);
    const err = await expectApiError(deleteInvoice(A(), W, sent.id), 409);
    expect(err.message).toMatch(/void it instead/);
    await expectApiError(updateInvoice(A(), W, sent.id, content()), 409);

    const voided = await voidInvoice(A(), W, sent.id);
    expect(voided).toMatchObject({ status: "void", number: sent.number });
    await expectApiError(voidInvoice(A(), W, sent.id), 409);
    await expectApiError(deleteInvoice(A(), W, sent.id), 409);
  });

  it("a draft can't be voided, and a paid invoice can't either", async () => {
    const draft = await newDraft();
    await expectApiError(voidInvoice(A(), W, draft.id), 409);
    const sent = await finaliseInvoice(A(), W, (await newDraft()).id);
    await markInvoicePaid(A(), { id: W, currency: "USD", locale: "en-US" }, sent.id, {});
    await expectApiError(voidInvoice(A(), W, sent.id), 409);
  });
});

describe("mark as paid — exactly one income entry", () => {
  const ws = () => ({ id: W, currency: "USD", locale: "en-US" });

  it("writes one income transaction in the invoice's profile, for the total", async () => {
    const sent = await finaliseInvoice(A(), W, (await newDraft()).id);
    const salary = await categoryId("adm", "Salary", "income");
    const res = await markInvoicePaid(A(), ws(), sent.id, { paidOn: "2026-10-05", categoryId: salary });
    expect(res.alreadyPaid).toBe(false);
    expect(res.invoice).toMatchObject({ status: "paid", paidOn: "2026-10-05", paidAmountMinor: 46787 });
    const [txn] = await db().select().from(transactions).where(eq(transactions.id, res.transactionId!));
    expect(txn).toMatchObject({
      type: "income",
      amountMinor: 46787,
      profileId: P,
      categoryId: salary,
      occurredOn: "2026-10-05",
      title: `Invoice ${sent.number}`,
    });
  });

  it("is idempotent — twice, or twice at once, is still one transaction", async () => {
    const sent = await finaliseInvoice(A(), W, (await newDraft()).id);
    const [a, b] = await Promise.all([
      markInvoicePaid(A(), ws(), sent.id, {}),
      markInvoicePaid(A(), ws(), sent.id, {}),
    ]);
    const again = await markInvoicePaid(A(), ws(), sent.id, {});
    const ids = new Set([a.transactionId, b.transactionId, again.transactionId]);
    expect(ids.size).toBe(1);
    expect(again.alreadyPaid).toBe(true);
    const rows = await db().select().from(transactions).where(eq(transactions.type, "income"));
    expect(rows).toHaveLength(1);
  });

  it("another currency needs the amount received in the workspace's currency", async () => {
    const eur = await finaliseInvoice(A(), W, (await newDraft("invoice", { currency: "EUR" })).id);
    await expectApiError(markInvoicePaid(A(), ws(), eur.id, {}), 422, "amount_required");
    const res = await markInvoicePaid(A(), ws(), eur.id, { amount: 510.25 });
    expect(res.invoice.paidAmountMinor).toBe(51025);
    const [txn] = await db().select().from(transactions).where(eq(transactions.id, res.transactionId!));
    expect(txn!.amountMinor).toBe(51025);
  });

  it("refuses a draft, a quote, a void invoice, an expense category and a viewer", async () => {
    const draft = await newDraft();
    await expectApiError(markInvoicePaid(A(), ws(), draft.id, {}), 409);
    const quote = await finaliseInvoice(A(), W, (await newDraft("quote")).id);
    await expectApiError(markInvoicePaid(A(), ws(), quote.id, {}), 409);
    const voided = await voidInvoice(A(), W, (await finaliseInvoice(A(), W, (await newDraft()).id)).id);
    await expectApiError(markInvoicePaid(A(), ws(), voided.id, {}), 409);
    const sent = await finaliseInvoice(A(), W, (await newDraft()).id);
    const groceries = await categoryId("adm", "Groceries", "expense");
    await expectApiError(markInvoicePaid(A(), ws(), sent.id, { categoryId: groceries }), 422);
    const vw = await member("vw", "viewer", "viewer");
    await expectApiError(markInvoicePaid(vw, ws(), sent.id, {}), 403);
    expect(await db().select().from(transactions)).toHaveLength(0);
  });
});

describe("quote → invoice", () => {
  it("makes a new draft invoice with the quote's lines, without its terms", async () => {
    const quote = await finaliseInvoice(A(), W, (await newDraft("quote", { terms: "50% upfront" })).id);
    const inv = await convertQuote(A(), W, quote.id, "2026-10-10");
    expect(inv).toMatchObject({
      kind: "invoice",
      status: "draft",
      sourceQuoteId: quote.id,
      totalMinor: quote.totalMinor,
      terms: null,
      issueDate: "2026-10-10",
      dueDate: "2026-11-09",
    });
    expect(inv.items.map((i) => i.amountMinor)).toEqual(quote.items.map((i) => i.amountMinor));
    await expectApiError(convertQuote(A(), W, inv.id), 409);
    await voidInvoice(A(), W, quote.id);
    await expectApiError(convertQuote(A(), W, quote.id), 409);
  });
});

describe("free tier limits — gate adding only", () => {
  it("20 invoices + quotes a month; the 21st is a plan_limit, and what exists stays", async () => {
    const max = INVOICE_LIMITS.free.perMonth;
    // Seed straight to the table: the allowance counts rows created this month.
    await db()
      .insert(invoices)
      .values(
        Array.from({ length: max - 1 }, () => ({
          workspaceId: W,
          profileId: P,
          kind: "invoice" as const,
          issueDate: "2026-10-01",
          currency: "USD",
          createdBy: A(),
        })),
      );
    const last = await newDraft("quote");
    const err = await expectApiError(newDraft(), 403, "plan_limit");
    expect(err.details).toMatchObject({ limit: "invoices", max, used: max });
    expect(await getAddLimits(W, A())).toMatchObject({ invoices: { used: max, limit: max, reached: true } });

    // Existing drafts still change, finalise and convert's add is refused.
    expect((await updateInvoice(A(), W, last.id, content({ notes: "x" }))).notes).toBe("x");
    const sentQuote = await finaliseInvoice(A(), W, last.id);
    await expectApiError(convertQuote(A(), W, sentQuote.id), 403, "plan_limit");

    // Deleting a draft frees its place.
    const [someDraft] = await db().select({ id: invoices.id }).from(invoices).where(and(eq(invoices.workspaceId, W), eq(invoices.status, "draft"))).limit(1);
    await deleteInvoice(A(), W, someDraft!.id);
    expect((await newDraft()).status).toBe("draft");
  });

  it("the allowance doesn't refill by moving to a paid plan (the free tier is on every plan)", async () => {
    await setWorkspacePlan(W, "pro");
    expect((await getUsage(W)).invoicing).toMatchObject({ tier: "free", perMonth: { limit: 20 }, templates: 5, footer: true });
  });

  it("20 saved clients; deleting one frees a place", async () => {
    const max = INVOICE_LIMITS.free.clients!;
    let first = "";
    for (let i = 0; i < max; i++) {
      const c = await createClient(A(), W, { profileId: P, name: `Client ${i}` });
      if (i === 0) first = c.id;
    }
    const err = await expectApiError(createClient(A(), W, { profileId: P, name: "One more" }), 403, "plan_limit");
    expect(err.details).toMatchObject({ limit: "invoiceClients", max, used: max });
    expect(await listClients(A(), W)).toHaveLength(max);
    expect(await deleteClient(A(), W, first)).toBe(true);
    expect((await createClient(A(), W, { profileId: P, name: "One more" })).name).toBe("One more");
  });

  it("one set of business details on the free tier", async () => {
    await createSeller(A(), W, { profileId: P, name: "Asha Studio" });
    const err = await expectApiError(createSeller(A(), W, { profileId: P, name: "Second" }), 403, "plan_limit");
    expect(err.details).toMatchObject({ limit: "invoiceSellers", max: 1 });
  });

  it("5 templates; an unknown one is refused", async () => {
    for (const template of ["classic", "modern", "bold", "minimal", "compact"]) {
      expect((await newDraft("invoice", { template })).template).toBe(template);
    }
    await expectApiError(newDraft("invoice", { template: "fancy" }), 422);
  });

  it("the footer is on every free-tier document", async () => {
    const sent = await finaliseInvoice(A(), W, (await newDraft()).id);
    expect(sent.showCredit).toBe(true);
  });

  it("a view-only workspace can't add an invoice", async () => {
    // A billing hold makes the workspace view-only.
    await db().update(workspaces).set({ billingHold: "dispute", billingHoldFrom: new Date(Date.now() - 1000) }).where(eq(workspaces.id, W));
    await expectApiError(newDraft(), 403);
  });
});

describe("the stored PDF — the hidden Invoices / Quotations storage", () => {
  it("is drawn and stored at finalise, counts toward storage, and is served after", async () => {
    const before = await getWorkspaceStorageUsage(W);
    const sent = await finaliseInvoice(A(), W, (await newDraft()).id);
    expect(sent.hasPdf).toBe(true);
    const [row] = await db().select().from(invoices).where(eq(invoices.id, sent.id));
    expect(row!.pdfKey).toMatch(new RegExp(`^invoices/${W}/${sent.id}/[0-9a-f-]+\\.pdf$`));
    expect(row!.pdfSizeBytes).toBeGreaterThan(1000);
    expect(await getWorkspaceStorageUsage(W)).toBe(before + row!.pdfSizeBytes!);

    const quote = await finaliseInvoice(A(), W, (await newDraft("quote")).id);
    const [qrow] = await db().select().from(invoices).where(eq(invoices.id, quote.id));
    expect(qrow!.pdfKey).toMatch(/^quotations\//);
    expect(await getStorageBreakdown(W)).toMatchObject({
      files: 0,
      attachments: 0,
      invoices: row!.pdfSizeBytes,
      quotations: qrow!.pdfSizeBytes,
    });

    const pdf = await getInvoicePdf(A(), W, sent.id);
    expect(pdf.fileName).toBe(`${sent.number}.pdf`);
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getTitle()).toBe(sent.number);
    expect(pdf.bytes).toEqual(bucket.get(row!.pdfKey!));
  });

  it("a draft's PDF is drawn on the spot and stored nowhere", async () => {
    const draft = await newDraft();
    const pdf = await getInvoicePdf(A(), W, draft.id);
    expect(pdf.fileName).toBe("draft-invoice.pdf");
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(1);
    expect(bucket.size).toBe(0);
  });

  it("a missing snapshot is stored on the first download", async () => {
    const sent = await finaliseInvoice(A(), W, (await newDraft()).id);
    await db().update(invoices).set({ pdfKey: null, pdfSizeBytes: null }).where(eq(invoices.id, sent.id));
    bucket.clear();
    await getInvoicePdf(A(), W, sent.id);
    const [row] = await db().select().from(invoices).where(eq(invoices.id, sent.id));
    expect(row!.pdfKey).not.toBeNull();
    expect(bucket.has(row!.pdfKey!)).toBe(true);
  });

  it("the seller's logo is stored once, counts toward storage, and goes into the PDF", async () => {
    const seller = await createSeller(A(), W, { profileId: P, name: "Asha Studio" });
    // A 1×1 PNG.
    const png = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
      (c) => c.charCodeAt(0),
    );
    const withLogo = await setSellerLogo(A(), W, seller.id, png);
    expect(withLogo.hasLogo).toBe(true);
    expect((await getStorageBreakdown(W)).logos).toBe(png.byteLength);
    await expectApiError(setSellerLogo(A(), W, seller.id, new TextEncoder().encode("<svg/>")), 422);

    const sent = await finaliseInvoice(A(), W, (await newDraft("invoice", { sellerId: seller.id })).id);
    expect(sent.hasLogo).toBe(true);
    const doc = await PDFDocument.load((await getInvoicePdf(A(), W, sent.id)).bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("a full workspace can't finalise (the PDF needs room)", async () => {
    const draft = await newDraft();
    // Fill the storage with a fake 1 GB logo.
    const seller = await createSeller(A(), W, { profileId: P, name: "Asha" });
    await db().execute(
      (await import("drizzle-orm")).sql`update invoice_sellers set logo_key = 'x', logo_size_bytes = ${1024 ** 3} where id = ${seller.id}`,
    );
    await expectApiError(finaliseInvoice(A(), W, draft.id), 413, "storage_quota_exceeded");
  });
});

describe("share links", () => {
  it("only finalised documents; the token resolves to the document and its PDF; revoking ends it", async () => {
    const draft = await newDraft();
    await expectApiError(createInvoiceShare(A(), W, draft.id), 409);

    const { invoice, share } = await sendInvoiceAsLink(A(), W, draft.id);
    expect(invoice.status).toBe("sent");
    expect(share.path).toBe(`/share/invoice/${share.token}`);
    expect(share.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const shared = await resolveInvoiceShare(share.token);
    expect(shared?.invoice).toMatchObject({ number: invoice.number, totalMinor: invoice.totalMinor });
    expect(shared?.invoice).not.toHaveProperty("createdBy");
    expect(shared?.invoice).not.toHaveProperty("profileId");
    expect((await getSharedInvoicePdf(share.token))?.fileName).toBe(`${invoice.number}.pdf`);

    // Sending again reuses the live link.
    expect((await sendInvoiceAsLink(A(), W, draft.id)).share.id).toBe(share.id);

    // Voided: the page still says what it was (and that it's void), but the PDF isn't handed out.
    await voidInvoice(A(), W, draft.id);
    expect((await resolveInvoiceShare(share.token))?.invoice.status).toBe("void");
    expect(await getSharedInvoicePdf(share.token)).toBeNull();

    expect(await revokeInvoiceShare(A(), W, draft.id, share.id)).toBe(true);
    expect(await resolveInvoiceShare(share.token)).toBeNull();
    expect(await resolveInvoiceShare("not-a-token!")).toBeNull();
  });

  it("an expired link stops; viewers can't list or make links", async () => {
    const sent = await finaliseInvoice(A(), W, (await newDraft()).id);
    const share = await createInvoiceShare(A(), W, sent.id, { expiresInDays: 1 });
    await db().execute(
      (await import("drizzle-orm")).sql`update invoice_shares set expires_at = now() - interval '1 minute' where id = ${share.id}`,
    );
    expect(await resolveInvoiceShare(share.token)).toBeNull();
    expect(await listInvoiceShares(A(), W, sent.id)).toEqual([]);
    const vw = await member("vw", "viewer", "viewer");
    await expectApiError(createInvoiceShare(vw, W, sent.id), 403);
    await expectApiError(listInvoiceShares(vw, W, sent.id), 403);
  });
});

describe("the trash", () => {
  it("a trashed profile hides its invoices and stops their links; restoring brings both back", async () => {
    const work = await seedProfile("adm", "Work");
    const sent = await finaliseInvoice(A(), W, (await newDraft("invoice", {}, A(), work)).id);
    const share = await createInvoiceShare(A(), W, sent.id);
    const [row] = await db().select().from(invoices).where(eq(invoices.id, sent.id));

    expect(await deleteProfile(A(), work)).toBe(true);
    expect(await getInvoice(A(), W, sent.id)).toBeNull();
    expect(await listInvoices(A(), W)).toEqual([]);
    expect(await resolveInvoiceShare(share.token)).toBeNull();
    await expectApiError(voidInvoice(A(), W, sent.id), 404);
    // Its PDF still counts, and shows as trash, until purged (C6).
    expect(await getTrashBytes(W)).toBe(row!.pdfSizeBytes);

    await restoreFromTrash(A(), W, { profileIds: [work] });
    expect((await getInvoice(A(), W, sent.id))?.number).toBe(sent.number);
    expect(await resolveInvoiceShare(share.token)).not.toBeNull();
  });

  it("deleting the profile for good deletes its invoices and their stored PDFs", async () => {
    const work = await seedProfile("adm", "Work");
    const sent = await finaliseInvoice(A(), W, (await newDraft("invoice", {}, A(), work)).id);
    const [row] = await db().select().from(invoices).where(eq(invoices.id, sent.id));
    expect(bucket.has(row!.pdfKey!)).toBe(true);
    await deleteProfile(A(), work);
    await deleteFromTrash(A(), W, { profileIds: [work] });
    expect(await db().select().from(invoices).where(eq(invoices.id, sent.id))).toEqual([]);
    expect(bucket.has(row!.pdfKey!)).toBe(false);
  });

  it("moving a profile's transactions on delete takes its invoices along", async () => {
    const work = await seedProfile("adm", "Work");
    const sent = await finaliseInvoice(A(), W, (await newDraft("invoice", {}, A(), work)).id);
    await createClient(A(), W, { profileId: work, name: "Moved client" });
    await deleteProfile(A(), work, { transactions: "move", toProfileId: P });
    expect((await getInvoice(A(), W, sent.id))?.profileId).toBe(P);
    expect((await listClients(A(), W, P)).map((c) => c.name)).toContain("Moved client");
    const [p] = await db().select().from(profiles).where(eq(profiles.id, work));
    expect(p!.deletedAt).not.toBeNull();
  });
});

describe("from the free generator", () => {
  const draft = () => ({
    kind: "invoice" as const,
    profileId: P,
    ...content(),
    logo: null,
  });

  it("brings a draft in once, saving its business details when there's room", async () => {
    const first = await importInvoiceDraft(A(), W, draft());
    expect(first).toMatchObject({ created: true, sellerSaved: true });
    expect(first.invoice).toMatchObject({ status: "draft", totalMinor: 46787 });
    expect(first.invoice.sellerId).not.toBeNull();

    const again = await importInvoiceDraft(A(), W, draft());
    expect(again).toMatchObject({ created: false });
    expect(again.invoice.id).toBe(first.invoice.id);
    expect(await listInvoices(A(), W)).toHaveLength(1);
  });

  it("still comes in when the business details limit is reached", async () => {
    const work = await seedProfile("adm", "Work");
    await createSeller(A(), W, { profileId: work, name: "Elsewhere" });
    const res = await importInvoiceDraft(A(), W, draft());
    expect(res).toMatchObject({ created: true, sellerSaved: false });
    expect(res.invoice.sellerId).toBeNull();
    expect(res.invoice.seller.name).toBe("Asha Studio");
  });
});
