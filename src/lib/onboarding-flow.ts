/**
 * A new account's welcome, in order: the terms, the country and currency, the
 * optional "About you" questions, then the product tour. Each is its own popup,
 * owned by a different part of the app — the layout's terms gate and currency
 * step, the tracker's questions and tour — and each opens the moment the one
 * before it is answered. The answer is saved in the background rather than
 * waited for, so the tracker never shows bare between two popups
 * (`components/app/onboarding-flow.tsx` holds the state).
 *
 * The tour isn't a step here: it comes last, once nothing else is owed.
 */
export const ONBOARDING_STEPS = ["terms", "currency", "about"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingTurn = OnboardingStep | "tour";

/**
 * Whose turn it is: the first step the server still owes this person (`owed`,
 * from their account) that hasn't been answered in this browser since
 * (`answered` — its save may still be on the way). "tour" once none is left.
 */
export function onboardingTurn(
  owed: Readonly<Record<OnboardingStep, boolean>>,
  answered: ReadonlySet<OnboardingStep>,
): OnboardingTurn {
  return ONBOARDING_STEPS.find((step) => owed[step] && !answered.has(step)) ?? "tour";
}
