import { Kbd } from "spendchat";

export function Combos() {
  return (
    <div className="grid gap-3 text-sm">
      {[
        ["Send transaction", "mod+enter"],
        ["Command palette", "mod+e"],
        ["Print statement", "mod+p"],
        ["Switch to profile 1", "shift+1"],
        ["Toggle shortcuts", "shift+`"],
        ["Dismiss", "esc"],
      ].map(([label, combo]) => (
        <div key={combo} className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">{label}</span>
          <Kbd combo={combo} />
        </div>
      ))}
    </div>
  );
}

export function Inline() {
  return (
    <p className="max-w-xs text-sm text-muted-foreground">
      Hold <Kbd combo="m" /> to dictate, then press <Kbd combo="mod+enter" /> to
      send.
    </p>
  );
}
