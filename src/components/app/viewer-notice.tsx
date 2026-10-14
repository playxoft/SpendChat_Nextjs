"use client";

import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlan } from "./upgrade-dialog";

/**
 * Shown in place of the compose / add controls when the current user can't write
 * to any profile in the workspace (a "pure viewer"). Purely cosmetic — the
 * server enforces the same per-profile role on every mutation.
 *
 * Two reasons someone lands here, worded differently:
 *  - their role is viewer — ask an admin for edit access;
 *  - the workspace itself is view-only: an extra free workspace (one free
 *    workspace per person) — it needs its own paid plan, so this offers the
 *    upgrade dialog instead of "ask an admin" — or a billing hold (a failed
 *    renewal past its grace, a disputed payment), which points to Billing or
 *    support. Nothing in it is deleted either way.
 *
 * `variant="bar"` matches the composer's sticky bottom bar (tracker); the default
 * `"card"` is an inline notice (transactions page).
 */
export function ViewerNotice({
  variant = "card",
  className,
}: {
  variant?: "card" | "bar";
  className?: string;
}) {
  const { readOnly, showUpgrade, addLimits, plan } = usePlan();
  const hold = addLimits?.readOnlyReason;
  const billingHold = hold === "payment_failed" || hold === "dispute" ? hold : null;

  const message = (
    <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-muted-foreground">
      {/* The bottom composer bar reads cleaner as plain text; the icon only helps
          the inline card notice. */}
      {variant === "card" && <Eye className="size-4 shrink-0" />}
      {readOnly && billingHold ? (
        <>
          <span>
            {billingHold === "dispute"
              ? "This workspace is view-only while a disputed payment is sorted out. Everything in it is still here to browse and export."
              : "This workspace is view-only because its plan's payment didn't go through. Everything in it is still here."}
          </span>
          <button
            type="button"
            onClick={() =>
              showUpgrade({ limit: "billingHold", plan, upgradeTo: null, holdReason: billingHold })
            }
            className="font-medium text-foreground underline underline-offset-2"
          >
            {billingHold === "dispute" ? "What to do" : "Fix the payment"}
          </button>
        </>
      ) : readOnly ? (
        <>
          <span>
            This workspace is view-only — you can have one free workspace. Everything in it is
            still here to browse and export.
          </span>
          <button
            type="button"
            onClick={() =>
              showUpgrade({ limit: "freeWorkspaces", plan: "free", upgradeTo: "plus" })
            }
            className="font-medium text-foreground underline underline-offset-2"
          >
            How to keep adding
          </button>
        </>
      ) : (
        <>
          You’re a viewer here — you can browse transactions but can’t add them. Ask an admin for
          edit access.
        </>
      )}
    </span>
  );

  if (variant === "bar") {
    return (
      <div
        className={cn(
          "sticky bottom-16 z-20 border-t bg-background px-3 py-3 md:bottom-0 md:bg-background/95 md:backdrop-blur-sm",
          className,
        )}
      >
        <div className="mx-auto max-w-3xl">{message}</div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-muted/40 px-3 py-2.5", className)}>{message}</div>
  );
}
