"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateNewsEmails } from "@/actions/settings";
import { Switch } from "@/components/ui/switch";

/**
 * Product news by email (`users.news_emails_at`) — the same choice as the
 * optional box on the terms dialog, changeable any time. Saves on toggle and
 * goes back if the save fails.
 */
export function NewsEmailsSetting({ initialOn }: { initialOn: boolean }) {
  const id = useId();
  const [on, setOn] = useState(initialOn);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setOn(next);
    startTransition(async () => {
      const res = await updateNewsEmails(next).catch(() => null);
      if (res?.ok) {
        toast.success(next ? "You'll hear about new features and offers" : "Product news turned off");
      } else {
        setOn(!next);
        toast.error(res?.error ?? "Couldn't save that. Try again.");
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer space-y-1">
        <span className="block text-sm font-medium">Product news</span>
        <span className="block text-sm text-muted-foreground">
          New features, updates and offers, and occasionally a request for your feedback.
        </span>
      </label>
      <Switch id={id} checked={on} onCheckedChange={toggle} disabled={pending} className="mt-1" />
    </div>
  );
}
