import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import { eq, inArray, sql } from "drizzle-orm";
import { deleteObjects } from "@/lib/r2";
import { files, folders, profiles, transactions } from "@/db/schema";
import { logger } from "@/lib/logger";
import { purgeExpiredTrash } from "@/lib/trash-purge";
import { CRON_TOKEN_HEADER, issueCronToken, revokeCronToken } from "@/lib/cron-token";
import * as cronRoute from "@/app/api/internal/cron/trash-purge/route";
import { deleteTransaction, deleteTransactions } from "@/services/transactions";
import { deleteFile, deleteFolder } from "@/services/files";
import { deleteProfile } from "@/services/profiles";
import { restoreFromTrash } from "@/services/trash";
import { signInAs, uid } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser, firstProfileId, insertTxn, setWorkspacePlan, workspaceIdOf } from "./helpers/seed";
import { seedFile, seedFolder, seedProfile, seedReceipt } from "./helpers/vault-seed";

const swept = () => vi.mocked(deleteObjects).mock.calls.flatMap(([keys]) => [...(keys ?? [])]);
const DAY = 86_400_000;

/** Backdate an item's trash stamp, as if it was deleted `days` ago. */
async function ageTrash(table: "transactions" | "files" | "folders" | "profiles", ids: string[], days: number) {
  const t = { transactions, files, folders, profiles }[table];
  await getTestDb()
    .update(t)
    .set({ deletedAt: sql`now() - make_interval(days => ${days})` })
    .where(inArray(t.id, ids));
}

const exists = async (table: "transactions" | "files" | "folders" | "profiles", id: string) => {
  const t = { transactions, files, folders, profiles }[table];
  return (await getTestDb().select({ id: t.id }).from(t).where(eq(t.id, id))).length > 0;
};

let U: string;
let W: string;
let P: string;

beforeEach(async () => {
  vi.mocked(deleteObjects).mockClear();
  signInAs("a");
  await bootstrapUser("a");
  U = uid("a");
  W = await workspaceIdOf("a");
  P = await firstProfileId("a");
  await setWorkspacePlan(W, "plus");
});

describe("purgeExpiredTrash", () => {
  it("destroys only what has been in the trash longer than 30 days — every kind — and sweeps its bytes", async () => {
    const oldTxn = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01" });
    const newTxn = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01" });
    await seedReceipt("a", oldTxn, P, { key: "attachments/old.pdf" });
    await seedReceipt("a", newTxn, P, { key: "attachments/new.pdf" });
    await deleteTransactions(U, W, { ids: [oldTxn, newTxn] });

    const oldFile = await seedFile("a", P, { key: "vault/old.pdf" });
    await deleteFile(U, W, oldFile);
    const oldFolder = await seedFolder("a", P, "Old");
    await seedFile("a", P, { folderId: oldFolder, key: "vault/in-old-folder.pdf" });
    await deleteFolder(U, W, oldFolder);

    const oldProfile = await seedProfile("a", "Gone");
    const inProfile = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01", profileId: oldProfile });
    await seedReceipt("a", inProfile, oldProfile, { key: "attachments/in-profile.pdf" });
    await deleteProfile(U, oldProfile, { transactions: "delete" });

    await ageTrash("transactions", [oldTxn], 31);
    await ageTrash("transactions", [newTxn], 29);
    await ageTrash("files", [oldFile], 31);
    await getTestDb().update(files).set({ deletedAt: sql`now() - interval '31 days'` }).where(eq(files.folderId, oldFolder));
    await ageTrash("folders", [oldFolder], 31);
    await ageTrash("profiles", [oldProfile], 31);

    const report = await purgeExpiredTrash();
    expect(report.complete).toBe(true);
    expect(report.counts).toEqual({ transactions: 1, files: 2, folders: 1, profiles: 1 });

    expect(await exists("transactions", oldTxn)).toBe(false);
    expect(await exists("transactions", newTxn)).toBe(true); // 29 days: still restorable
    expect(await exists("files", oldFile)).toBe(false);
    expect(await exists("folders", oldFolder)).toBe(false);
    expect(await exists("profiles", oldProfile)).toBe(false);
    expect(await exists("transactions", inProfile)).toBe(false);
    expect(swept()).toEqual(
      expect.arrayContaining([
        "attachments/old.pdf",
        "vault/old.pdf",
        "vault/in-old-folder.pdf",
        "attachments/in-profile.pdf",
      ]),
    );
    expect(swept()).not.toContain("attachments/new.pdf");
    expect(report.objects).toBe(4);
  });

  it("is idempotent: a second run finds nothing", async () => {
    const id = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01" });
    await deleteTransaction(U, W, id);
    await ageTrash("transactions", [id], 40);
    expect((await purgeExpiredTrash()).counts.transactions).toBe(1);
    vi.mocked(deleteObjects).mockClear();
    const again = await purgeExpiredTrash();
    expect(again.counts).toEqual({ transactions: 0, files: 0, folders: 0, profiles: 0 });
    expect(swept()).toHaveLength(0);
  });

  it("never touches a live row, however old, nor an item restored before it ran", async () => {
    const liveOld = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2020-01-01" });
    const restored = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01" });
    await deleteTransaction(U, W, restored);
    await ageTrash("transactions", [restored], 45);
    await restoreFromTrash(U, W, { transactionIds: [restored] });

    await purgeExpiredTrash({ now: new Date(Date.now() + 365 * DAY) });
    expect(await exists("transactions", liveOld)).toBe(true);
    expect(await exists("transactions", restored)).toBe(true);
  });

  it("works through a backlog in batches, and stops at its time budget", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01" }));
    }
    await deleteTransactions(U, W, { ids });
    await ageTrash("transactions", ids, 31);

    const stopped = await purgeExpiredTrash({ budgetMs: 0 });
    expect(stopped.complete).toBe(false);
    expect(stopped.counts.transactions).toBe(0);

    const done = await purgeExpiredTrash({ batchSize: 2 });
    expect(done.complete).toBe(true);
    expect(done.counts.transactions).toBe(5);
  });

  it("logs exactly one prose summary line per run", async () => {
    const info = vi.spyOn(logger, "info");
    const warn = vi.spyOn(logger, "warn");
    const id = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01" });
    await deleteTransaction(U, W, id);
    await ageTrash("transactions", [id], 31);
    info.mockClear();
    warn.mockClear();

    await purgeExpiredTrash();
    const lines = [...info.mock.calls, ...warn.mock.calls].filter(
      ([, meta]) => (meta as { event?: string } | undefined)?.event === "trash.purged",
    );
    expect(lines).toHaveLength(1);
    const [message, meta] = lines[0]!;
    expect(message).toMatch(/^Trash purge removed 1 transaction older than 30 days and 0 stored objects in \d+ms$/);
    expect(meta).toMatchObject({ event: "trash.purged", transactions: 1, objects: 0, complete: true });
    info.mockRestore();
    warn.mockRestore();
  });
});

describe("POST /api/internal/cron/trash-purge", () => {
  const live: string[] = [];
  afterEach(() => {
    for (const t of live.splice(0)) revokeCronToken(t);
  });

  const post = (token?: string) =>
    cronRoute.POST(
      new Request("https://spendchat.app/api/internal/cron/trash-purge", {
        method: "POST",
        headers: token === undefined ? {} : { [CRON_TOKEN_HEADER]: token },
      }),
    );

  it("is a 404 to anyone without the token of a run in flight — every method", async () => {
    expect((await post()).status).toBe(404);
    expect((await post("")).status).toBe(404);
    expect((await post("guess")).status).toBe(404);
    // A token from a run that has finished is no good either.
    const stale = issueCronToken();
    revokeCronToken(stale);
    expect((await post(stale)).status).toBe(404);
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"] as const) {
      expect(cronRoute[method]().status).toBe(404);
    }
  });

  it("runs the purge for the in-flight run's token", async () => {
    const id = await insertTxn("a", { type: "expense", amountMinor: 1, occurredOn: "2026-06-01" });
    await deleteTransaction(U, W, id);
    await ageTrash("transactions", [id], 31);
    const token = issueCronToken();
    live.push(token);

    const res = await post(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, complete: true, counts: { transactions: 1 } });
    expect(await exists("transactions", id)).toBe(false);
  });
});
