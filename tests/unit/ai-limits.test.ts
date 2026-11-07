import { describe, expect, it } from "vitest";
import {
  MAX_INPUT_CHARS,
  MAX_TRANSCRIPT_CHARS,
  aiNoteMaxChars,
  aiNoteRoomierPlan,
  aiNoteTooLongMessage,
  aiQuestionTooLongMessage,
} from "@/lib/ai-limits";
import { PERSONAL_PLANS, PLAN_LIMITS } from "@/lib/plans";
import { AI_CHAT_QUESTION_MAX } from "@/lib/validation";

describe("AI length caps per plan", () => {
  it("sets the note and question caps the plans promise", () => {
    expect(PERSONAL_PLANS.map(aiNoteMaxChars)).toEqual([1000, 2000, 3000]);
    expect(PERSONAL_PLANS.map((p) => PLAN_LIMITS[p].aiQuestionChars)).toEqual([500, 1000, 2000]);
    expect(PLAN_LIMITS.free.aiActionsPerMonth).toBe(30);
  });

  it("keeps the parser's and the schema's ceilings at the top plan's cap", () => {
    expect(MAX_INPUT_CHARS).toBe(PLAN_LIMITS.pro.aiNoteChars);
    expect(AI_CHAT_QUESTION_MAX).toBe(PLAN_LIMITS.pro.aiQuestionChars);
  });

  it("leaves room for a full voice transcript on every plan with voice entry", () => {
    for (const plan of PERSONAL_PLANS.filter((p) => PLAN_LIMITS[p].voice)) {
      expect(aiNoteMaxChars(plan), plan).toBeGreaterThan(MAX_TRANSCRIPT_CHARS);
    }
  });

  it("names the cap and the next plan up, and only the cap at the top", () => {
    expect(aiNoteRoomierPlan("free")).toBe("plus");
    expect(aiNoteRoomierPlan("plus")).toBe("pro");
    expect(aiNoteRoomierPlan("pro")).toBeNull();
    expect(aiNoteTooLongMessage("free")).toBe(
      "That's a lot of text. Keep it under 1,000 characters — Plus takes up to 2,000.",
    );
    expect(aiNoteTooLongMessage("pro")).toBe("That's a lot of text. Keep it under 3,000 characters.");
    expect(aiQuestionTooLongMessage("plus")).toBe("Keep it under 1,000 characters — Pro takes up to 2,000.");
  });
});
