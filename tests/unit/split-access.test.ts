import { describe, it, expect } from "vitest";
import {
  canDeleteSettlement,
  canEditExpense,
  canManageGroup,
  canRecordSettlement,
  canSeeEmail,
  memberLabel,
  SPLIT_MEMBER_FALLBACK_NAME,
  type SplitViewer,
} from "@/lib/split-access";

const creator: SplitViewer = { userId: "u-creator", memberId: "m-creator", isCreator: true };
const member: SplitViewer = { userId: "u-asha", memberId: "m-asha", isCreator: false };

describe("split access rules", () => {
  it("only the creator manages the group", () => {
    expect(canManageGroup(creator)).toBe(true);
    expect(canManageGroup(member)).toBe(false);
  });

  it("an expense is editable by whoever added it, or the creator", () => {
    expect(canEditExpense(member, { createdBy: "u-asha" })).toBe(true);
    expect(canEditExpense(member, { createdBy: "u-ravi" })).toBe(false);
    expect(canEditExpense(creator, { createdBy: "u-ravi" })).toBe(true);
  });

  it("a member records only payments they made or received; the creator any", () => {
    expect(canRecordSettlement(member, { fromMemberId: "m-asha", toMemberId: "m-ravi" })).toBe(true);
    expect(canRecordSettlement(member, { fromMemberId: "m-ravi", toMemberId: "m-asha" })).toBe(true);
    expect(canRecordSettlement(member, { fromMemberId: "m-ravi", toMemberId: "m-zoe" })).toBe(false);
    expect(canRecordSettlement(creator, { fromMemberId: "m-ravi", toMemberId: "m-zoe" })).toBe(true);
  });

  it("a payment is undone by whoever recorded it, or the creator", () => {
    expect(canDeleteSettlement(member, { createdBy: "u-asha" })).toBe(true);
    expect(canDeleteSettlement(member, { createdBy: "u-ravi" })).toBe(false);
    expect(canDeleteSettlement(creator, { createdBy: "u-ravi" })).toBe(true);
  });

  it("emails are the creator's to see, and each member's own", () => {
    expect(canSeeEmail(creator, { id: "m-ravi" })).toBe(true);
    expect(canSeeEmail(member, { id: "m-asha" })).toBe(true);
    expect(canSeeEmail(member, { id: "m-ravi" })).toBe(false);
  });

  it("labels never fall back to an email", () => {
    expect(memberLabel({ displayName: " Ravi " })).toBe("Ravi");
    expect(memberLabel({ displayName: null })).toBe(SPLIT_MEMBER_FALLBACK_NAME);
    expect(memberLabel({ displayName: "  " })).toBe(SPLIT_MEMBER_FALLBACK_NAME);
  });
});
