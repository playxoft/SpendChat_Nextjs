import { ShortcutList } from "spendchat";

// Renders the app's real shortcut registry, grouped by scope — no props.
export function All() {
  return (
    <div className="w-full max-w-md">
      <ShortcutList />
    </div>
  );
}
