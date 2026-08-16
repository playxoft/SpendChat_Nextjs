import { SettingsNav } from "spendchat";

// Horizontal scroller on mobile, vertical rail from `lg` up. The card viewport
// is set above that breakpoint so all seven sections are visible at once
// instead of scrolling off the side.
export function Rail() {
  return (
    <div className="w-full">
      <SettingsNav />
    </div>
  );
}
