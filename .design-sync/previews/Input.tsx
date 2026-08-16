import { Input, Label } from "spendchat";

export function Default() {
  return (
    <div className="grid max-w-xs gap-1.5">
      <Label htmlFor="merchant">Merchant</Label>
      <Input id="merchant" placeholder="Where did you spend?" />
    </div>
  );
}

export function Filled() {
  return (
    <div className="grid max-w-xs gap-1.5">
      <Label htmlFor="amount">Amount</Label>
      <Input id="amount" inputMode="decimal" defaultValue="1,240.00" />
    </div>
  );
}

export function Types() {
  return (
    <div className="grid max-w-xs gap-3">
      <Input type="email" placeholder="you@example.com" />
      <Input type="date" defaultValue="2026-10-14" />
      <Input type="search" placeholder="Search transactions" />
      <Input type="file" />
    </div>
  );
}

export function States() {
  return (
    <div className="grid max-w-xs gap-3">
      <Input placeholder="Disabled" disabled />
      <Input defaultValue="Not a valid amount" aria-invalid />
      <Input readOnly defaultValue="Read only" />
    </div>
  );
}
