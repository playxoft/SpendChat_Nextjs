"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * A single-thumb slider (Radix). `thumbLabel` names the thumb for screen
 * readers and `valueText` is what they announce instead of the raw number
 * ("₹30.00", "25%").
 */
function Slider({
  className,
  thumbLabel,
  valueText,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  thumbLabel?: string
  valueText?: string
}) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
      >
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        aria-label={thumbLabel}
        aria-valuetext={valueText}
        className="block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm ring-ring/50 transition-[color,box-shadow] outline-none hover:ring-4 focus-visible:ring-4 disabled:pointer-events-none pointer-coarse:size-5"
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
