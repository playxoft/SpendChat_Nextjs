import { Label, Switch } from "spendchat";

export function States() {
  return (
    <div className="flex items-center gap-4">
      <Switch />
      <Switch defaultChecked />
      <Switch disabled />
      <Switch defaultChecked disabled />
    </div>
  );
}

export function SettingsRows() {
  return (
    <div className="grid w-80 divide-y rounded-lg border">
      {[
        ["Compact composer", "Tighter rows in the entry bar", true],
        ["Voice entry", "Hold M to dictate a transaction", true],
        ["Weekly summary email", "Every Monday at 09:00", false],
      ].map(([title, desc, on]) => (
        <div key={String(title)} className="flex items-center justify-between gap-4 p-3">
          <div className="grid gap-0.5">
            <Label className="font-medium">{title}</Label>
            <span className="text-xs text-muted-foreground">{desc}</span>
          </div>
          <Switch defaultChecked={Boolean(on)} />
        </div>
      ))}
    </div>
  );
}
