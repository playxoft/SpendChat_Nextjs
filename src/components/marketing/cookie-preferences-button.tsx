"use client";

import { Button } from "@/components/ui/button";
import { reopenConsentBanner } from "@/lib/consent";
import { marketingCta } from "@/lib/marketing";

export function CookiePreferencesButton() {
  return (
    <Button className={marketingCta} onClick={reopenConsentBanner}>
      Manage cookie preferences
    </Button>
  );
}
