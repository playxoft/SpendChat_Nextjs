import { describe, expect, it } from "vitest";
import {
  ABOUT_OPTIONS,
  DESCRIBES,
  FEATURES,
  FREQUENCY,
  GOALS,
  TEAM_SIZE,
  TRACKING_NOW,
  USE_FOR,
  USE_WITH,
  aboutYouAnswersSchema,
  asksTeamSize,
  cleanAboutYou,
} from "@/lib/about-you";

describe("the About you answers", () => {
  it("accept only the listed choices — nothing typed, nothing extra", () => {
    expect(aboutYouAnswersSchema.safeParse({}).success).toBe(true);
    expect(
      aboutYouAnswersSchema.safeParse({
        useFor: "business",
        goals: ["track", "invoices"],
        useWith: "team",
        trackingNow: "spreadsheet",
        describes: "freelancer",
        teamSize: "2-10",
        frequency: "daily",
        features: ["ai", "voice"],
      }).success,
    ).toBe(true);
    expect(aboutYouAnswersSchema.safeParse({ useFor: "hobby" }).success).toBe(false);
    expect(aboutYouAnswersSchema.safeParse({ goals: ["track", "world domination"] }).success).toBe(false);
    expect(aboutYouAnswersSchema.safeParse({ name: "Ada" }).success).toBe(false);
    // Email preferences live on the terms dialog, not here.
    expect(aboutYouAnswersSchema.safeParse({ feedbackChat: true }).success).toBe(false);
  });

  it("offer a label for every value the schema accepts", () => {
    const pairs: [readonly string[], { value: string }[]][] = [
      [USE_FOR, ABOUT_OPTIONS.useFor],
      [GOALS, ABOUT_OPTIONS.goals],
      [USE_WITH, ABOUT_OPTIONS.useWith],
      [TRACKING_NOW, ABOUT_OPTIONS.trackingNow],
      [DESCRIBES, ABOUT_OPTIONS.describes],
      [TEAM_SIZE, ABOUT_OPTIONS.teamSize],
      [FREQUENCY, ABOUT_OPTIONS.frequency],
      [FEATURES, ABOUT_OPTIONS.features],
    ];
    for (const [values, options] of pairs) {
      expect(options.map((o) => o.value)).toEqual([...values]);
    }
  });

  it("ask team size only for business use", () => {
    expect(asksTeamSize("business")).toBe(true);
    expect(asksTeamSize("both")).toBe(true);
    expect(asksTeamSize("personal")).toBe(false);
    expect(asksTeamSize(undefined)).toBe(false);
  });

  it("are tidied before storing: no duplicates, no empty lists, no stray team size", () => {
    expect(
      cleanAboutYou({ useFor: "personal", teamSize: "2-10", goals: ["track", "track"], features: [] }),
    ).toEqual({ useFor: "personal", goals: ["track"] });
    expect(cleanAboutYou({ useFor: "both", teamSize: "11-50" })).toEqual({
      useFor: "both",
      teamSize: "11-50",
    });
  });
});

