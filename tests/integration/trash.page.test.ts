import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/r2", () => ({
  keyFromPublicUrl: () => null,
  isR2Configured: () => true,
  uploadObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  deleteObjects: vi.fn(async () => {}),
  signedGetUrl: vi.fn(async () => "https://signed.example/object"),
}));

import type { ReactElement } from "react";
import TrashPage from "@/app/app/trash/page";
import { deleteTransaction } from "@/services/transactions";
import { deleteFile } from "@/services/files";
import { signInAs, uid } from "./helpers/session";
import { bootstrapUser, firstProfileId, insertTxn, setWorkspacePlan, workspaceIdOf } from "./helpers/seed";
import { seedFile } from "./helpers/vault-seed";

/**
 * The trash page's server half: what it reads and hands the client component.
 * (The client half is UI only; every rule it shows is the server's, tested in
 * the trash.* suites.)
 */
describe("/app/trash", () => {
  it("hands the client the caller's trash, counts, trash bytes and admin flag", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const W = await workspaceIdOf("a");
    await setWorkspacePlan(W, "plus");
    const P = await firstProfileId("a");
    const txn = await insertTxn("a", { type: "expense", amountMinor: 100, occurredOn: "2026-06-01", title: "gone" });
    await deleteTransaction(uid("a"), W, txn);
    const file = await seedFile("a", P, { sizeBytes: 2048 });
    await deleteFile(uid("a"), W, file);

    const page = (await TrashPage()) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>;
    const props = page.props.children.props;
    expect(props).toMatchObject({
      isAdmin: true,
      nextCursor: null,
      counts: { transactions: 1, files: 1, folders: 0, profiles: 0 },
      trashBytes: 2048,
      currency: "USD",
    });
    expect((props.rows as { id: string; canRestore: boolean }[]).map((r) => [r.id, r.canRestore])).toEqual([
      [txn, true],
    ]);
    expect((props.files as { id: string }[]).map((f) => f.id)).toEqual([file]);
    // C6: relative times are computed from the server's clock, passed down, so
    // the server render and the hydration agree.
    expect(Date.parse(props.now as string)).not.toBeNaN();
    expect(props.filesCapped).toBe(false);
  });
});
