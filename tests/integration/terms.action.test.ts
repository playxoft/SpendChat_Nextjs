import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { acceptTerms, updateNewsEmails } from "@/actions/settings";
import { LEGAL_VERSION } from "@/lib/legal";
import { signInAs } from "./helpers/session";
import { getTestDb } from "./helpers/test-db";
import { bootstrapUser } from "./helpers/seed";

const termsOf = (id: string) =>
  getTestDb()
    .select({ version: users.termsVersion, at: users.termsAcceptedAt })
    .from(users)
    .where(eq(users.id, id))
    .then((r) => r[0]);

describe("acceptTerms (the in-app gate)", () => {
  it("records the current version for the signed-in person", async () => {
    const me = signInAs("a");
    await bootstrapUser("a");
    expect((await termsOf(me.id))?.version).toBeNull();

    const res = await acceptTerms(LEGAL_VERSION);
    expect(res.ok).toBe(true);
    const row = await termsOf(me.id);
    expect(row?.version).toBe(LEGAL_VERSION);
    expect(row?.at).toBeInstanceOf(Date);
  });

  it("refuses a version that isn't in force — nobody agrees to text they weren't shown", async () => {
    const me = signInAs("a");
    await bootstrapUser("a");
    const res = await acceptTerms("2020-01-01");
    expect(res.ok).toBe(false);
    expect((await termsOf(me.id))?.version).toBeNull();
  });

  it("keeps the first acceptance time when the same version is accepted again", async () => {
    const me = signInAs("a");
    await bootstrapUser("a");
    await acceptTerms(LEGAL_VERSION);
    const first = (await termsOf(me.id))?.at;
    await new Promise((r) => setTimeout(r, 5));
    await acceptTerms(LEGAL_VERSION);
    expect((await termsOf(me.id))?.at?.getTime()).toBe(first?.getTime());
  });

  it("only ever writes the caller's own row", async () => {
    const other = signInAs("b");
    await bootstrapUser("b");
    signInAs("a");
    await bootstrapUser("a");
    await acceptTerms(LEGAL_VERSION);
    expect((await termsOf(other.id))?.version).toBeNull();
  });
});

const newsOf = (id: string) =>
  getTestDb()
    .select({ at: users.newsEmailsAt })
    .from(users)
    .where(eq(users.id, id))
    .then((r) => r[0]?.at ?? null);

describe("product news emails", () => {
  it("is off unless the optional box on the gate was ticked", async () => {
    const me = signInAs("n1");
    await bootstrapUser("n1");
    await acceptTerms(LEGAL_VERSION);
    expect(await newsOf(me.id)).toBeNull();

    const other = signInAs("n2");
    await bootstrapUser("n2");
    await acceptTerms(LEGAL_VERSION, { newsEmails: true });
    expect(await newsOf(other.id)).toBeInstanceOf(Date);
  });

  it("is never recorded with a refused terms version", async () => {
    const me = signInAs("n3");
    await bootstrapUser("n3");
    expect((await acceptTerms("2020-01-01", { newsEmails: true })).ok).toBe(false);
    expect(await newsOf(me.id)).toBeNull();
  });

  it("turns on and off from Settings — on keeps the first yes, off clears it", async () => {
    const me = signInAs("n4");
    await bootstrapUser("n4");
    expect((await updateNewsEmails(true)).ok).toBe(true);
    const first = await newsOf(me.id);
    expect(first).toBeInstanceOf(Date);
    await new Promise((r) => setTimeout(r, 5));
    await updateNewsEmails(true);
    expect((await newsOf(me.id))?.getTime()).toBe(first?.getTime());
    expect((await updateNewsEmails(false)).ok).toBe(true);
    expect(await newsOf(me.id)).toBeNull();
    // Anything but a boolean is refused rather than read as "on".
    expect((await updateNewsEmails("yes" as unknown as boolean)).ok).toBe(false);
  });
});
