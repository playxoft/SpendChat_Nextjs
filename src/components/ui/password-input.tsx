"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field with a show/hide toggle. Forwards every native input prop to
 * the shared `Input`, so it drops in wherever a `type="password"` input was —
 * the eye button flips the type between "password" and "text".
 */
function PasswordInput({ className, ...props }: React.ComponentProps<"input">) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        // Room for the toggle so a long value never slides under the icon.
        className={cn("pr-9", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Kept out of the tab order — it's an aid, not a form control; screen
        // readers still reach it and announce the pressed state.
        tabIndex={-1}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export { PasswordInput };
