"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck, CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkoutReturnStatus } from "@/actions/billing";
import { PLAN_NAMES, type PersonalPlan } from "@/lib/plans";

type Status = Awaited<ReturnType<typeof checkoutReturnStatus>>;
type Known = Extract<Status, { ok: true }>["status"];

/** How often to ask, and for how long before saying it's taking a while. */
const POLL_MS = 2_000;
const PATIENT_MS = 90_000;

/**
 * "Activating…" until the webhook has landed. Asks our server every two
 * seconds (a read, rate-limited like any other); the provider is never asked.
 * After 90 seconds it keeps asking, more slowly, and says why it can take a
 * while (a UPI mandate, a bank's check).
 */
export function ReturnPoller({
  workspace,
  expect,
}: {
  workspace: { id: string; name: string; icon: string };
  expect?: { plan: string; period: string };
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<Known | null>(null);
  const [slow, setSlow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const expectKey = expect ? `${expect.plan}:${expect.period}` : "";

  React.useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const target = expectKey ? { plan: expectKey.split(":")[0], period: expectKey.split(":")[1] } : undefined;

    async function tick() {
      const res = await checkoutReturnStatus(workspace.id, target).catch(() => null);
      if (stopped) return;
      if (res && !res.ok) {
        setError(res.error);
        return;
      }
      const next = res?.status ?? null;
      if (next) setStatus(next);
      if (next && (next.state === "done" || next.state === "failed" || next.state === "none")) {
        if (next.state === "done") router.refresh();
        return;
      }
      const waited = Date.now() - started;
      if (waited > PATIENT_MS) setSlow(true);
      timer = setTimeout(tick, waited > PATIENT_MS ? POLL_MS * 5 : POLL_MS);
    }
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [workspace.id, expectKey, router]);

  const done = status?.state === "done";
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden>{workspace.icon}</span>
        {workspace.name}
      </p>
      <div aria-live="polite" className="mt-4 space-y-3">
        {error ? (
          <Message icon={<CircleAlert className="size-8 text-destructive" />} title="Couldn't check the payment" body={error} />
        ) : done && status.item === "plan" ? (
          <Message
            icon={<CircleCheck className="size-8 text-emerald-600 dark:text-emerald-500" />}
            title={`${workspace.name} is on ${PLAN_NAMES[status.plan as PersonalPlan]}`}
            body={
              status.trialEndsAt
                ? `Your free trial runs until ${formatDay(status.trialEndsAt)}. Cancel any time before then and you won't be charged.`
                : "Everything in the plan is ready to use."
            }
          />
        ) : done && status.item === "topup" ? (
          <Message
            icon={<CircleCheck className="size-8 text-emerald-600 dark:text-emerald-500" />}
            title={`${status.actions.toLocaleString("en-US")} AI actions added`}
            body="They're used once this month's allowance runs out, and last 12 months."
          />
        ) : status?.state === "failed" ? (
          <Message
            icon={<CircleAlert className="size-8 text-destructive" />}
            title="The payment didn't go through"
            body="Nothing was charged and the workspace hasn't changed. You can try again with another card or UPI app."
          />
        ) : status?.state === "none" ? (
          <Message
            icon={<CircleAlert className="size-8 text-muted-foreground" />}
            title="Nothing to confirm here"
            body="There's no recent purchase for this workspace. If you just paid, it'll show in Billing in a few minutes."
          />
        ) : (
          <Message
            icon={<Loader2 className="size-8 animate-spin text-muted-foreground" />}
            title={expect ? "Changing your plan…" : "Activating…"}
            body={
              slow
                ? "This is taking longer than usual — some banks and UPI apps take a few minutes to confirm. You can leave this page; the workspace updates as soon as the payment is confirmed."
                : "Confirming the payment with the provider. This usually takes a few seconds."
            }
          />
        )}
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {done ? (
          <Button asChild>
            <Link href="/app">
              Open {workspace.name} <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : status?.state === "failed" || status?.state === "none" ? (
          <Button asChild>
            <Link href="/app/upgrade">
              Back to plans <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/app/settings/billing">Billing</Link>
        </Button>
      </div>
    </div>
  );
}

function Message({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <>
      <div className="flex justify-center">{icon}</div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </>
  );
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}
