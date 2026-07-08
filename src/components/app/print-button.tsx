"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button
      variant="outline"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <Printer className="size-4" />
      <span className="hidden sm:inline">Print</span>
    </Button>
  );
}
