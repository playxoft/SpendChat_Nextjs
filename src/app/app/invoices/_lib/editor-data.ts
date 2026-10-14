import "server-only";
import { getWorkspaceEntitlements, invoiceLimitsOf } from "@/lib/entitlements";
import { getProfiles } from "@/lib/queries";
import { rolesAtLeast } from "@/lib/rbac";
import { profileRolesFor } from "@/lib/workspaces";
import { listClients, listSellers } from "@/services/invoices";

/** What the invoice editor needs besides the document: where it can go and what's saved there. */
export async function loadEditorData(userId: string, workspaceId: string) {
  const [profiles, roles, clients, sellers, ent] = await Promise.all([
    getProfiles(userId, workspaceId),
    profileRolesFor(userId, workspaceId),
    listClients(userId, workspaceId),
    listSellers(userId, workspaceId),
    getWorkspaceEntitlements(workspaceId),
  ]);
  const editors = rolesAtLeast("editor");
  const writable = profiles
    .filter((p) => editors.includes(roles.get(p.id) ?? "viewer"))
    .map((p) => ({ id: p.id, name: p.name, icon: p.icon }));
  return { writable, clients, sellers, footer: invoiceLimitsOf(ent).footer, readOnly: ent.readOnly };
}
