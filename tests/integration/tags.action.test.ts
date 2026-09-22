import { describe, it, expect } from "vitest";
import { addTag, updateTag, deleteTag, countTransactionsForTag } from "@/actions/tags";
import { signInAs } from "./helpers/session";
import { bootstrapUser } from "./helpers/seed";

const MISSING = "00000000-0000-0000-0000-000000000000";

/**
 * The server-action half of tags — the web app's path, where `/api/v1/tags` is
 * the other.
 *
 * The cases that matter here are the ones where the service reports "nothing
 * matched". The actions used to discard that and return `{ ok: true }`, so the
 * settings manager toasted "Tag updated" over a write that never happened —
 * while the REST route, on the same service call, answered 404. Two people with
 * the settings page open is all it takes: one deletes a tag, the other renames
 * it and is told it worked.
 */
describe("tag actions", () => {
  it("creates a tag and hands the row back", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await addTag({ name: "Travel", color: "#EF4444" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The created row, not `{}` — the composer applies it to the transaction
    // being typed rather than re-listing and matching on name.
    expect(res.tag.name).toBe("Travel");
    expect(res.tag.color).toBe("#ef4444");
    expect(typeof res.tag.createdAt).toBe("string");
  });

  it("rejects a duplicate name, case-insensitively", async () => {
    signInAs("a");
    await bootstrapUser("a");
    expect((await addTag({ name: "Travel", color: "#ef4444" })).ok).toBe(true);
    const dup = await addTag({ name: "travel", color: "#ef4444" });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error).toMatch(/already exists/);
  });

  it("reports a rename that matched nothing instead of claiming success", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await updateTag({ id: MISSING, name: "Trips" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/not found/i);
  });

  it("reports a delete that matched nothing instead of claiming success", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const res = await deleteTag(MISSING);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/not found/i);
  });

  it("won't touch another workspace's tag", async () => {
    signInAs("a");
    await bootstrapUser("a");
    const created = await addTag({ name: "Travel", color: "#ef4444" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    signInAs("b");
    await bootstrapUser("b");
    // Same shape as a tag that doesn't exist — which is the point: B learns
    // nothing about A's workspace from the answer.
    expect((await updateTag({ id: created.tag.id, name: "Stolen" })).ok).toBe(false);
    expect((await deleteTag(created.tag.id)).ok).toBe(false);
    expect(await countTransactionsForTag(created.tag.id)).toEqual({ ok: true, count: 0 });
  });
});
