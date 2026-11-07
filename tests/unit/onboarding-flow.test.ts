import { describe, expect, it } from "vitest";
import { onboardingTurn, type OnboardingStep } from "@/lib/onboarding-flow";

const owedAll = { terms: true, currency: true, about: true };
const none = new Set<OnboardingStep>();

describe("onboardingTurn", () => {
  it("starts with the terms when everything is owed", () => {
    expect(onboardingTurn(owedAll, none)).toBe("terms");
  });

  it("moves on the moment a step is answered, before the server knows", () => {
    expect(onboardingTurn(owedAll, new Set<OnboardingStep>(["terms"]))).toBe("currency");
    expect(onboardingTurn(owedAll, new Set<OnboardingStep>(["terms", "currency"]))).toBe("about");
    expect(onboardingTurn(owedAll, new Set<OnboardingStep>(["terms", "currency", "about"]))).toBe(
      "tour",
    );
  });

  it("skips a step that isn't owed (a sign-up that ticked the terms already)", () => {
    expect(onboardingTurn({ terms: false, currency: true, about: true }, none)).toBe("currency");
    expect(onboardingTurn({ terms: false, currency: false, about: true }, none)).toBe("about");
  });

  it("goes back to a step whose save failed, ahead of the ones after it", () => {
    // Terms and currency answered; the terms' save failed, so it's answered no more.
    expect(onboardingTurn(owedAll, new Set<OnboardingStep>(["currency"]))).toBe("terms");
  });

  it("is the tour's turn when nothing is owed (an existing account)", () => {
    expect(onboardingTurn({ terms: false, currency: false, about: false }, none)).toBe("tour");
  });

  it("keeps the order whatever order the answers came in", () => {
    expect(onboardingTurn(owedAll, new Set<OnboardingStep>(["about", "terms"]))).toBe("currency");
  });
});
