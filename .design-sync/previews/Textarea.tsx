import { Label, Textarea } from "spendchat";

export function Default() {
  return (
    <div className="grid max-w-sm gap-1.5">
      <Label htmlFor="note">Note</Label>
      <Textarea id="note" placeholder="Add a note for this transaction…" />
    </div>
  );
}

export function Filled() {
  return (
    <div className="grid max-w-sm gap-1.5">
      <Label htmlFor="bulk">Paste transactions</Label>
      <Textarea
        id="bulk"
        rows={5}
        defaultValue={"Groceries 1240 14 Oct\nRent 32000 1 Oct\nSalary +85000 1 Oct"}
      />
    </div>
  );
}

export function States() {
  return (
    <div className="grid max-w-sm gap-3">
      <Textarea placeholder="Disabled" disabled />
      <Textarea defaultValue="Could not parse this line" aria-invalid />
    </div>
  );
}
