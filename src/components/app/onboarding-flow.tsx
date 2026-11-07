"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { onboardingTurn, type OnboardingStep, type OnboardingTurn } from "@/lib/onboarding-flow";

type OnboardingFlow = {
  /** The popup that should be showing now (`lib/onboarding-flow.ts`). */
  turn: OnboardingTurn;
  /** The step was answered: the next one opens in this same render, while its save is on the way. */
  answer: (step: OnboardingStep) => void;
  /** Its save failed: it's that step's turn again (with its error), ahead of anything after it. */
  reopen: (step: OnboardingStep) => void;
};

// Outside the provider nothing is owed, so the tour may start as it always did.
const OnboardingFlowContext = createContext<OnboardingFlow>({
  turn: "tour",
  answer: () => {},
  reopen: () => {},
});

/**
 * The welcome's order, shared by the popups that make it up: the layout's
 * `TermsGate` and `CurrencyStepDialog`, the tracker's `AboutYouDialog` and
 * `ProductTour`. Each opens only on its turn, and moves the turn on as soon as
 * it's answered — so one popup hands over to the next with no wait for the
 * server and no glimpse of the page in between. `owed` comes from the account,
 * fresh on every server render; what's been answered here is kept on top of it.
 */
export function OnboardingFlowProvider({
  owed,
  children,
}: {
  owed: Record<OnboardingStep, boolean>;
  children: React.ReactNode;
}) {
  const [answered, setAnswered] = useState<ReadonlySet<OnboardingStep>>(() => new Set());
  const answer = useCallback(
    (step: OnboardingStep) => setAnswered((prev) => new Set(prev).add(step)),
    [],
  );
  const reopen = useCallback(
    (step: OnboardingStep) =>
      setAnswered((prev) => {
        const next = new Set(prev);
        next.delete(step);
        return next;
      }),
    [],
  );
  const turn = onboardingTurn(owed, answered);
  const value = useMemo(() => ({ turn, answer, reopen }), [turn, answer, reopen]);
  return <OnboardingFlowContext.Provider value={value}>{children}</OnboardingFlowContext.Provider>;
}

export function useOnboardingFlow(): OnboardingFlow {
  return useContext(OnboardingFlowContext);
}
