import { Checkbox, Input, Label, Switch } from "spendchat";

export function WithInput() {
  return (
    <div className="grid max-w-xs gap-1.5">
      <Label htmlFor="category">Category</Label>
      <Input id="category" placeholder="Groceries" />
    </div>
  );
}

export function WithControls() {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="recurring" defaultChecked />
        <Label htmlFor="recurring">Repeats every month</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="compact" />
        <Label htmlFor="compact">Compact composer</Label>
      </div>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex items-center gap-2" data-disabled>
      <Checkbox id="locked" disabled />
      <Label htmlFor="locked">Locked by workspace admin</Label>
    </div>
  );
}
