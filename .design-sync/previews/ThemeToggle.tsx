import { ThemeToggle } from "spendchat";

// A ghost icon button that opens a light/dark/system menu on click.
export function Default() {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <ThemeToggle />
      <span className="text-sm text-muted-foreground">Theme</span>
    </div>
  );
}

export function InToolbar() {
  return (
    <div className="flex w-72 items-center justify-between rounded-lg border px-3 py-2">
      <span className="text-sm font-medium">Appearance</span>
      <ThemeToggle />
    </div>
  );
}
