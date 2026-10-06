/**
 * Who may do what in a split group — the one copy of the rules, used by the
 * services to enforce them and by the UI to decide which buttons to show.
 * Pure: the caller resolves `SplitViewer` from the database first
 * (`services/split.ts#requireJoined`), and anyone who isn't a *joined* member
 * never gets this far — they get a 404, so a group's existence doesn't leak.
 *
 * | | Creator | Joined member |
 * |---|---|---|
 * | Rename, change currency, delete the group | ✓ | — |
 * | Add / remove people, see invite links | ✓ | — |
 * | Add an expense | ✓ | ✓ |
 * | Edit / delete an expense | any | ones they added |
 * | Record a settlement | between anyone | when they paid or were paid |
 * | Delete a settlement | any | ones they recorded |
 * | See someone's email | everyone's | only their own |
 */

export type SplitViewer = {
  userId: string;
  /** The viewer's own row in this group. */
  memberId: string;
  isCreator: boolean;
};

/** Rename, re-icon, change the currency, delete, add and remove people. */
export function canManageGroup(viewer: SplitViewer): boolean {
  return viewer.isCreator;
}

export function canEditExpense(viewer: SplitViewer, expense: { createdBy: string }): boolean {
  return viewer.isCreator || expense.createdBy === viewer.userId;
}

export function canRecordSettlement(
  viewer: SplitViewer,
  settlement: { fromMemberId: string; toMemberId: string },
): boolean {
  return (
    viewer.isCreator ||
    settlement.fromMemberId === viewer.memberId ||
    settlement.toMemberId === viewer.memberId
  );
}

export function canDeleteSettlement(viewer: SplitViewer, settlement: { createdBy: string }): boolean {
  return viewer.isCreator || settlement.createdBy === viewer.userId;
}

/**
 * Emails are the creator's to see (they typed them) and each member's own.
 * A stranger on a 50-person trip doesn't get 49 addresses.
 */
export function canSeeEmail(viewer: SplitViewer, member: { id: string }): boolean {
  return viewer.isCreator || member.id === viewer.memberId;
}

/** Shown when a row has no name (it always should — adding someone needs one). */
export const SPLIT_MEMBER_FALLBACK_NAME = "Member";
/** What a deleted account's row is called from then on. */
export const SPLIT_DELETED_MEMBER_NAME = "Deleted account";

/** The name a member is shown under. Never derived from the email. */
export function memberLabel(member: { displayName: string | null }): string {
  return member.displayName?.trim() || SPLIT_MEMBER_FALLBACK_NAME;
}
