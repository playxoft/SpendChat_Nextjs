"use client";

import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AGE_RULES, LEGAL_DOCUMENTS, LEGAL_UPDATED, type TermsChoices } from "@/lib/legal";

/**
 * The short, friendly version of what someone agrees to. Every line restates
 * something the full documents say — when a document changes what one of these
 * promises, change the line in the same edit, because this is the part people
 * read.
 */
const HIGHLIGHTS: { title: string; body: string }[] = [
  {
    title: "A notebook for your money, not advice",
    body: "SpendChat helps you keep track of what you earn and spend. It's not a bank, it never moves your money, and nothing in it is financial, tax or legal advice.",
  },
  {
    title: "Your data is yours",
    body: "We never sell it, never use it for ads, and never use it to train AI. You can download it or delete your account anytime in Settings.",
  },
  {
    title: "AI only when you ask",
    body: "When you use AI entry, voice or SpendChat AI, we send only what that request needs to Google's AI to get your answer. AI can make mistakes, so give it a quick check.",
  },
  {
    title: "Be kind with other people's info",
    body: "Only add someone's name or email (to a split, an invite or an invoice) if they're OK with it.",
  },
  {
    title: "Free stays free",
    body: "Paid plans renew automatically until you cancel in Settings → Billing. Refunds follow our Billing & refund policy and your local laws.",
  },
  {
    title: `${AGE_RULES.minAge} or older`,
    body: `If you're under ${AGE_RULES.adultAge}, use SpendChat (and buy a plan) only with a parent's or guardian's OK.`,
  },
];

/** The summary plus links to the full documents (each opens in a new tab). */
export function TermsHighlights() {
  return (
    <div className="space-y-4">
      <ul className="max-h-[min(36vh,20rem)] space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-4 text-sm">
        {HIGHLIGHTS.map((h) => (
          <li key={h.title} className="space-y-0.5">
            <p className="font-medium text-foreground">{h.title}</p>
            <p className="text-muted-foreground">{h.body}</p>
          </li>
        ))}
        <li className="border-t pt-3 text-xs text-muted-foreground">
          This is the short version. The full documents below are the actual agreement.
          Effective {LEGAL_UPDATED}.
        </li>
      </ul>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
        {LEGAL_DOCUMENTS.map((d) => (
          <li key={d.href}>
            <a
              href={d.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 hover:no-underline"
            >
              {d.title}
              <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The one box to tick — agreeing to the terms and confirming the minimum age
 * in one go, so sign-up stays a single tap. Unticked by default, and the links
 * sit outside the label on purpose: a link inside a `<label>` toggles the box
 * when clicked.
 */
export function TermsCheckbox({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <label htmlFor={id} className="cursor-pointer text-sm leading-snug">
        I&apos;m {AGE_RULES.minAge} or older, and I agree to the Terms and Privacy Policy.
      </label>
    </div>
  );
}

/**
 * The optional second box: product news by email (`users.news_emails_at`).
 * Marketing, so it starts unticked, nothing depends on it, and it's worded as
 * what we'd send — never pre-ticked or folded into the terms.
 */
export function NewsEmailsCheckbox({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <label htmlFor={id} className="cursor-pointer text-sm leading-snug">
        Email me about new features, updates and offers, and occasionally ask for my feedback
        (optional).
      </label>
    </div>
  );
}

/**
 * "Read this, tick the box, then continue." The confirm button stays disabled
 * until the terms box is ticked; the second box (product news) is optional.
 * Both reset each time the dialog opens, so an agreement is always to what's
 * on screen.
 *
 * `onCancel` omitted = the dialog can't be dismissed (the in-app gate, whose
 * only other way out is its own sign-out button passed as `secondary`).
 */
export function TermsConsentDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending = false,
  error,
  onConfirm,
  onCancel,
  cancelLabel = "Cancel",
  secondary,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: (choices: TermsChoices) => void;
  onCancel?: () => void;
  cancelLabel?: string;
  secondary?: React.ReactNode;
}) {
  const [checked, setChecked] = useState(false);
  const [news, setNews] = useState(false);
  // Untick on every opening, however it was closed (a parent closing it after
  // a confirm never goes through onOpenChange).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChecked(false);
      setNews(false);
    }
  }
  const dismissible = Boolean(onCancel);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && dismissible && !pending) onCancel?.();
      }}
    >
      <DialogContent
        showCloseButton={dismissible}
        className="sm:max-w-lg"
        // Outside clicks never dismiss a dialog here (see `DialogContent`);
        // Escape does, except where there's nothing to fall back to.
        onEscapeKeyDown={(e) => {
          if (!dismissible || pending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <TermsHighlights />

        <div className="space-y-2">
          <TermsCheckbox checked={checked} onCheckedChange={setChecked} disabled={pending} />
          <NewsEmailsCheckbox checked={news} onCheckedChange={setNews} disabled={pending} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          {secondary}
          {dismissible && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
              {cancelLabel}
            </Button>
          )}
          <Button
            type="button"
            onClick={() => onConfirm({ newsEmails: news })}
            disabled={!checked || pending}
          >
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
