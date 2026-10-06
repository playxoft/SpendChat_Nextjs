import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, workspaces } from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import { ensureBootstrap } from "@/lib/auth";
import { findUserById } from "@/lib/directory";
import { notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { PersonalPlan } from "@/lib/plans";
import { renameOrganizationSchema } from "@/lib/validation";
import { listUserWorkspaces, readOnlyWorkspaceSql } from "@/lib/workspaces";

/**
 * The organisation is the top of organisation → workspace → space → profile.
 * Every account has exactly one personal organisation (created at bootstrap),
 * holding the workspaces that person owns. Plans and billing are per
 * workspace, so this is mostly a listing: Settings → Organisation shows the
 * name, the owner and every workspace with its plan.
 */

export type OrganizationWorkspace = {
  id: string;
  name: string;
  icon: string | null;
  plan: PersonalPlan;
  /** An extra free workspace (the owner has an older free one) — view-only until upgraded. */
  readOnly: boolean;
  /** Whether the viewer can open it (they own the org, so: always, unless removed). */
  canOpen: boolean;
};

export type OrganizationOverview = {
  id: string;
  name: string;
  kind: "personal" | "business";
  owner: { id: string; name: string | null; email: string | null };
  workspaces: OrganizationWorkspace[];
};

/** The caller's personal organisation and its workspaces. */
export async function getMyOrganization(userId: string): Promise<OrganizationOverview> {
  await ensureBootstrap(userId);
  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.ownerId, userId), eq(organizations.kind, "personal")))
    .limit(1);
  if (!org) throw notFound("Organisation not found");

  const [rows, owner, openable] = await Promise.all([
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        icon: workspaces.icon,
        plan: workspaces.plan,
        // Qualified by hand: see `readOnlyWorkspaceSql` on bare columns.
        readOnly: readOnlyWorkspaceSql(sql`${workspaces}."id"`),
      })
      .from(workspaces)
      .where(eq(workspaces.organizationId, org.id))
      .orderBy(asc(workspaces.createdAt)),
    findUserById(org.ownerId),
    listUserWorkspaces(userId),
  ]);
  const canOpen = new Set(openable.map((w) => w.id));
  return {
    id: org.id,
    name: org.name,
    kind: org.kind,
    owner: { id: org.ownerId, name: owner?.name ?? null, email: owner?.email ?? null },
    workspaces: rows.map((w) => ({ ...w, readOnly: Boolean(w.readOnly), canOpen: canOpen.has(w.id) })),
  };
}

/** Rename the caller's personal organisation (owner only — it's theirs by definition). */
export async function renameMyOrganization(userId: string, input: unknown): Promise<void> {
  const { name } = parseOrThrow(renameOrganizationSchema, input);
  const db = getDb();
  const updated = await db
    .update(organizations)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(organizations.ownerId, userId), eq(organizations.kind, "personal")))
    .returning({ id: organizations.id });
  if (updated.length === 0) throw notFound("Organisation not found");
  logger.info("Organisation renamed", {
    event: "organization.renamed",
    organizationId: updated[0]!.id,
    userId,
  });
}
