import { SiteNav } from "spendchat";

// Fixed floating pill at the top of every marketing page.
export function Marketing() {
  return (
    <div className="relative h-32 w-full overflow-hidden rounded-lg border bg-muted/20">
      <SiteNav />
    </div>
  );
}
