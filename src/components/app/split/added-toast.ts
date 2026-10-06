import { toast } from "sonner";
import type { AddedPerson } from "@/services/split";

/**
 * One toast for the people just added. The same words whoever they are: the
 * app never says whether an address has an account, so neither does this.
 */
export function toastAdded(added: AddedPerson[], names: Map<string, string>): void {
  const invited = added.filter((a) => a.status === "invited").map((a) => names.get(a.email) ?? a.email);
  if (invited.length === 0) return;
  toast.success(
    `Invited ${invited.join(", ")}. If they haven't joined in a day or two, send them their invite link — it's under People.`,
  );
}
