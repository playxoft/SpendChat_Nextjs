import { toast } from "sonner";
import type { AddedPerson } from "@/services/split";

/**
 * One toast for the people just added. `names` are in the order the people
 * were sent — the answers come back in that order. The same words whoever
 * they are: the app never says whether an address has an account, so neither
 * does this. People added without an email are named apart, since nobody
 * invites them.
 */
export function toastAdded(added: AddedPerson[], names: string[]): void {
  const nameOf = (a: AddedPerson, i: number) => names[i] || a.email || "Someone";
  const invited = added.flatMap((a, i) => (a.status === "invited" ? [nameOf(a, i)] : []));
  const byName = added.flatMap((a, i) => (a.status === "added" ? [nameOf(a, i)] : []));
  if (invited.length === 0 && byName.length === 0) return;
  const lines: string[] = [];
  if (invited.length) lines.push(`Invited ${invited.join(", ")}.`);
  if (byName.length) {
    lines.push(`Added ${byName.join(", ")} by name only — nobody was invited, but you can split with them.`);
  }
  if (invited.length) {
    lines.push("If they haven't joined in a day or two, send them their invite link — it's under People.");
  }
  toast.success(lines.join(" "));
}
