import { toast } from "sonner";
import type { AddedPerson } from "@/services/split";

/**
 * One toast summing up what happened to the people just added: who sees an
 * invitation in the app, who was emailed, and who needs the link shared.
 */
export function toastAdded(added: AddedPerson[], names: Map<string, string>): void {
  const label = (a: AddedPerson) => names.get(a.email) ?? a.email;
  const inApp = added.filter((a) => a.delivery === "in_app").map(label);
  const emailed = added.filter((a) => a.delivery === "email").map(label);
  const link = added.filter((a) => a.delivery === "link").map(label);
  const lines: string[] = [];
  if (inApp.length) lines.push(`${inApp.join(", ")} will see an invitation in the app.`);
  if (emailed.length) lines.push(`We emailed ${emailed.join(", ")} an invite.`);
  if (link.length) lines.push(`Share the invite link with ${link.join(", ")} — it's under People.`);
  if (lines.length) toast.success(lines.join(" "));
}
