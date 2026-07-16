import { describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getTestDb } from "./helpers/test-db";
import type { FirebaseTokenClaims } from "@/lib/firebase-verify";

// The global setup mocks `@/lib/identity` so the rest of the suite drives auth
// with `signInAs()`. This file tests the REAL `resolveUser` (first-insert,
// cross-provider linking, duplicate-email conflict) against PGlite.
vi.unmock("@/lib/identity");

const claims = (over: Partial<FirebaseTokenClaims> & { sub: string }): FirebaseTokenClaims =>
  ({ email_verified: true, ...over }) as FirebaseTokenClaims;

describe("resolveUser", () => {
  it("creates a row on first sign-in and reuses it afterwards", async () => {
    const { resolveUser } = await import("@/lib/identity");
    const first = await resolveUser(claims({ sub: "uid-1", email: "One@Example.com" }));
    expect(first.email).toBe("one@example.com"); // stored lowercased

    const again = await resolveUser(claims({ sub: "uid-1", email: "One@Example.com" }));
    expect(again.id).toBe(first.id);
  });

  it("links a second provider with the same verified email to the existing account", async () => {
    const { resolveUser } = await import("@/lib/identity");
    // Email/password sign-up…
    const original = await resolveUser(claims({ sub: "uid-pass", email: "foo@x.com" }));
    // …then Google sign-in for the same address under a new Firebase UID.
    const linked = await resolveUser(claims({ sub: "uid-google", email: "Foo@X.com" }));
    expect(linked.id).toBe(original.id);

    const [row] = await getTestDb()
      .select({ firebaseUid: users.firebaseUid })
      .from(users)
      .where(eq(users.id, original.id));
    expect(row.firebaseUid).toBe("uid-google");
  });

  it("rejects an UNVERIFIED email that already belongs to an account with a 409", async () => {
    const { resolveUser } = await import("@/lib/identity");
    await resolveUser(claims({ sub: "uid-a", email: "taken@x.com" }));
    await expect(
      resolveUser(claims({ sub: "uid-b", email: "taken@x.com", email_verified: false })),
    ).rejects.toMatchObject({ status: 409, code: "conflict" });
  });
});
