import type { DeleteProfileInput } from "@/lib/validation";

/** The counts `GET /profiles/{id}/deletion-impact` reports. */
export type ProfileDeletionCounts = {
  transactions: number;
  files: number;
  attachments: number;
};

/** What the delete dialog offers once it knows there are transactions. */
export type ProfileDisposalChoice = "delete" | "move";

/**
 * Translate what the confirm dialog knows into what it may ask the server for.
 *
 * `delete` destroys a profile's transactions and their receipts with no undo,
 * so it is only ever sent when the dialog has **positively established** there
 * are transactions (`counts` read, non-zero) *and* the user was shown the
 * choice and picked it. `counts === null` means the impact call is still in
 * flight or failed — not that the profile is empty — and everything uncertain
 * falls back to `reject`, the server's refuse-while-not-empty guard.
 *
 * That fallback is the whole point: a dropped impact call used to leave the
 * dialog reading "This profile has no transactions" with `delete` armed
 * underneath, so one click on a profile of 1,800 transactions destroyed all of
 * them plus their receipts, with the 409 that exists to prevent exactly that
 * never firing — because the client had explicitly asked for the delete.
 * Sending `reject` when in doubt turns that worst case back into an error
 * message.
 */
export function profileDisposalRequest(
  counts: ProfileDeletionCounts | null,
  disposal: ProfileDisposalChoice,
  toProfileId: string,
): DeleteProfileInput {
  if (!counts || counts.transactions <= 0) return { transactions: "reject" };
  if (disposal === "move") {
    // No destination is a 422 rather than a delete; the button guards this too.
    return toProfileId
      ? { transactions: "move", toProfileId }
      : { transactions: "reject" };
  }
  return { transactions: "delete" };
}
