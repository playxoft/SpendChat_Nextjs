"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InputModeForm } from "./input-mode-form";
import { ComposerDensityForm } from "./composer-density-form";
import type { ComposerDensity, InputMode } from "@/lib/validation";

/**
 * Settings → Input: the two settings that change the composer's shape, and the
 * one piece of state they share.
 *
 * They are separate saves — you can change the layout without touching the
 * density — but they describe the same strip of UI, so each one's preview has
 * to render at the *other's* current selection. Otherwise the density cards
 * show a layout you just moved away from, which is what made them look broken:
 * a picture of a composer nobody has.
 *
 * The shared value is the selection, not the saved setting, so the previews
 * follow a click before either card is saved.
 */
export function InputSettings({
  inputMode,
  density,
  preview,
}: {
  inputMode: InputMode;
  density: ComposerDensity;
  /** What the previews need to render the composer the way this workspace
   *  actually sees it, rather than a hardcoded currency and a frozen date. */
  preview: { symbol: string; locale: string; today: string };
}) {
  const [selectedMode, setSelectedMode] = useState<InputMode>(inputMode);
  const [selectedDensity, setSelectedDensity] = useState<ComposerDensity>(density);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Transaction input</CardTitle>
          <CardDescription>
            Choose how the composer at the bottom of the tracker lays out its
            fields when you add a transaction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InputModeForm
            inputMode={inputMode}
            density={selectedDensity}
            onSelectedChange={setSelectedMode}
            preview={preview}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          {/* The "Unavailable on mobile" badge lives on the Normal option
              itself (see `ComposerDensityForm`) — that's the thing that's
              actually unavailable, and putting it there means the user reads it
              exactly where they'd otherwise tap. */}
          <CardTitle>Composer density</CardTitle>
          <CardDescription>
            Choose how much room the composer’s controls take. Applies to every
            profile and workspace, on any device you sign in from.{" "}
            <span className="md:hidden">
              Phones always use <strong className="font-medium">Compact</strong> —
              Normal spends a second row on the category slider, which is
              desktop-only — so this setting changes what you see on a larger
              screen, not here.
            </span>
            <span className="hidden md:inline">
              Phones always use Compact regardless of what you pick here.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ComposerDensityForm
            density={density}
            inputMode={selectedMode}
            onSelectedChange={setSelectedDensity}
            preview={preview}
          />
        </CardContent>
      </Card>
    </div>
  );
}
