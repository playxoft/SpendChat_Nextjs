"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { saveAboutYou } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ABOUT_OPTIONS,
  asksTeamSize,
  type AboutYouAnswers,
  type Option,
} from "@/lib/about-you";
import {
  HEARD_FROM_OPTIONS,
  HEARD_FROM_OTHER_MAX,
  type HeardFromChoice,
} from "@/lib/attribution";
import { cn } from "@/lib/utils";
import { useOnboardingFlow } from "./onboarding-flow";

type SingleKey = "useFor" | "useWith" | "trackingNow" | "describes" | "teamSize" | "frequency";
type MultiKey = "goals" | "features";

type Step =
  | { kind: "single"; key: SingleKey; title: string; options: Option<string>[] }
  | { kind: "multi"; key: MultiKey; title: string; options: Option<string>[] }
  | { kind: "heard"; title: string };

/** The questions, in order; team size only follows a business answer. */
function stepsFor(answers: AboutYouAnswers, askHeardFrom: boolean): Step[] {
  const steps: Step[] = [
    { kind: "single", key: "useFor", title: "Will you use SpendChat for…", options: ABOUT_OPTIONS.useFor },
  ];
  if (asksTeamSize(answers.useFor)) {
    steps.push({ kind: "single", key: "teamSize", title: "How big is your team?", options: ABOUT_OPTIONS.teamSize });
  }
  steps.push(
    { kind: "single", key: "describes", title: "Which best describes you?", options: ABOUT_OPTIONS.describes },
    { kind: "multi", key: "goals", title: "What brings you here?", options: ABOUT_OPTIONS.goals },
    { kind: "single", key: "useWith", title: "Who will you use it with?", options: ABOUT_OPTIONS.useWith },
    { kind: "single", key: "trackingNow", title: "How do you track money today?", options: ABOUT_OPTIONS.trackingNow },
    { kind: "single", key: "frequency", title: "How often will you add things?", options: ABOUT_OPTIONS.frequency },
    { kind: "multi", key: "features", title: "What are you most excited to try?", options: ABOUT_OPTIONS.features },
  );
  if (askHeardFrom) steps.push({ kind: "heard", title: "Where did you hear about us?" });
  return steps;
}

/** One full-width option row — every question lists its choices in a single column. */
const rowClass = (selected: boolean) =>
  cn(
    "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
    selected
      ? "border-foreground/60 bg-muted text-foreground"
      : "border-border bg-background text-foreground hover:bg-muted/60",
  );

/** A one-answer choice: a radio dot, and tapping it picks it. */
function RadioRow({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className={rowClass(selected)}>
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-foreground" : "border-muted-foreground/50",
        )}
      >
        {selected && <span className="size-2 rounded-full bg-foreground" />}
      </span>
      <span>{label}</span>
    </button>
  );
}

/** A pick-as-many choice: a real checkbox; the whole row is its label. */
function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={rowClass(checked)}>
      <Checkbox id={id} checked={checked} onCheckedChange={onToggle} />
      <span>{label}</span>
    </label>
  );
}

/**
 * "About you" — the optional welcome questions (`lib/about-you.ts`), shown once
 * on the tracker, straight after the currency step and before the product
 * tour. One question per screen, its choices in a single column of full-width
 * rows — radio rows for one answer (which move on as soon as one is tapped),
 * checkboxes for several. The popup keeps one fixed size on every step. Every
 * screen can be skipped, and "Skip all" ends it. Answered or skipped, it's
 * saved once and never comes back.
 *
 * It opens on its turn in the welcome (`OnboardingFlowProvider`), the moment
 * the currency step is answered. Finishing just closes it — no "you might
 * like" screen, which would send people off to other pages before the tour has
 * shown them around — and hands straight over to the tour (`ProductTour`).
 *
 * The answers are saved in the background; a failed save only means they're
 * asked again on the next visit.
 */
export function AboutYouDialog({ askHeardFrom }: { askHeardFrom: boolean }) {
  const { turn, answer } = useOnboardingFlow();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AboutYouAnswers>({});
  const [heardFrom, setHeardFrom] = useState<HeardFromChoice | null>(null);
  const [heardOther, setHeardOther] = useState("");
  const [, startSave] = useTransition();
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  const steps = stepsFor(answers, askHeardFrom);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const isLast = index >= steps.length - 1;

  function save(status: "answered" | "skipped") {
    const payload = {
      status,
      answers,
      ...(askHeardFrom
        ? {
            heardFrom: heardFrom ?? "skipped",
            ...(heardFrom === "other" && heardOther.trim() ? { heardFromOther: heardOther.trim() } : {}),
          }
        : {}),
    };
    startSave(async () => {
      await saveAboutYou(payload).catch(() => null);
    });
  }

  function next() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (isLast) {
      save("answered");
      answer("about");
    } else {
      setIndex((i) => i + 1);
    }
  }

  function back() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setIndex((i) => Math.max(0, i - 1));
  }

  function skipAll() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    save("skipped");
    answer("about");
  }

  /** Move on by itself after a choice — a beat later, so the tick is seen. */
  function advanceSoon() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => setIndex((i) => i + 1), 220);
  }

  function pickSingle(key: SingleKey, value: string) {
    const deselect = answers[key] === value;
    const nextAnswers = { ...answers, [key]: deselect ? undefined : value } as AboutYouAnswers;
    // Team size is only for business use; drop it if that answer changes.
    if (key === "useFor" && !asksTeamSize(nextAnswers.useFor)) delete nextAnswers.teamSize;
    setAnswers(nextAnswers);
    if (deselect) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    } else {
      advanceSoon();
    }
  }

  function toggleMulti(key: MultiKey, value: string) {
    setAnswers((a) => {
      const list = (a[key] ?? []) as string[];
      const nextList = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...a, [key]: nextList.length ? nextList : undefined } as AboutYouAnswers;
    });
  }

  const progress = Math.round((index / steps.length) * 100);

  return (
    <Dialog
      open={turn === "about"}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) skipAll();
      }}
    >
      {/* One fixed size for every step, so the popup never jumps as the
          questions change: the header and footer stay put, and a long list
          scrolls in the middle. */}
      <DialogContent className="flex h-[min(38rem,calc(100dvh-2rem))] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="space-y-5 px-6 pt-7 pb-5">
          <div className="space-y-2 pr-8">
            <p className="text-xs text-muted-foreground">
              Question {index + 1} of {steps.length} · all optional
            </p>
            <div
              className="h-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progress"
            >
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <DialogHeader className="gap-1.5">
            <DialogTitle className="text-lg">{step.title}</DialogTitle>
            <DialogDescription>
              {step.kind === "multi"
                ? "Tick as many as you like."
                : index === 0
                  ? "Help us shape SpendChat around you — a few taps, and you can skip any of them."
                  : "Pick one to keep going."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div
            className="flex flex-col gap-2.5"
            role={step.kind === "multi" ? "group" : "radiogroup"}
            aria-label={step.title}
          >
            {step.kind === "single" &&
              step.options.map((o) => (
                <RadioRow
                  key={o.value}
                  label={o.label}
                  selected={answers[step.key] === o.value}
                  onSelect={() => pickSingle(step.key, o.value)}
                />
              ))}
            {step.kind === "multi" &&
              step.options.map((o) => (
                <CheckRow
                  key={o.value}
                  label={o.label}
                  checked={((answers[step.key] ?? []) as string[]).includes(o.value)}
                  onToggle={() => toggleMulti(step.key, o.value)}
                />
              ))}
            {step.kind === "heard" &&
              HEARD_FROM_OPTIONS.map((o) => (
                <RadioRow
                  key={o.value}
                  label={o.label}
                  selected={heardFrom === o.value}
                  onSelect={() => {
                    const value = heardFrom === o.value ? null : o.value;
                    setHeardFrom(value);
                    // "Other" waits for the optional "where?" box.
                    if (value && value !== "other") advanceSoon();
                    else if (advanceTimer.current) clearTimeout(advanceTimer.current);
                  }}
                />
              ))}
          </div>

          {step.kind === "heard" && heardFrom === "other" && (
            <Input
              autoFocus
              value={heardOther}
              maxLength={HEARD_FROM_OTHER_MAX}
              onChange={(e) => setHeardOther(e.target.value)}
              placeholder="Where? (optional)"
              aria-label="Where did you hear about us?"
              className="mt-3 h-11"
            />
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t px-6 py-4 sm:justify-between">
          <div className="flex items-center gap-1">
            {index > 0 && (
              <Button type="button" variant="ghost" onClick={back}>
                <ArrowLeft className="size-4" /> Back
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={skipAll}>
              Skip all
            </Button>
          </div>
          <Button type="button" onClick={next} className="min-w-20">
            {isLast ? "Finish" : stepAnswered(step, answers, heardFrom) ? "Next" : "Skip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function stepAnswered(step: Step, answers: AboutYouAnswers, heardFrom: HeardFromChoice | null): boolean {
  switch (step.kind) {
    case "single":
      return answers[step.key] !== undefined;
    case "multi":
      return (answers[step.key]?.length ?? 0) > 0;
    case "heard":
      return heardFrom !== null;
  }
}
