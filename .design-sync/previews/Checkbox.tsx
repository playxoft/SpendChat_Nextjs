import { Checkbox, Label } from "spendchat";

export function States() {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="c1" />
        <Label htmlFor="c1">Unchecked</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c2" defaultChecked />
        <Label htmlFor="c2">Checked</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c3" disabled />
        <Label htmlFor="c3">Disabled</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c4" defaultChecked disabled />
        <Label htmlFor="c4">Checked and disabled</Label>
      </div>
    </div>
  );
}

export function ColumnPicker() {
  return (
    <div className="grid w-56 gap-2.5 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">Visible columns</p>
      {[
        ["Date", true],
        ["Merchant", true],
        ["Category", true],
        ["Profile", false],
        ["Attachments", false],
      ].map(([label, on]) => (
        <div key={String(label)} className="flex items-center gap-2">
          <Checkbox id={`col-${label}`} defaultChecked={Boolean(on)} />
          <Label htmlFor={`col-${label}`} className="font-normal">
            {label}
          </Label>
        </div>
      ))}
    </div>
  );
}
