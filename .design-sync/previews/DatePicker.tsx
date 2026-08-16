import { DatePicker, Label } from "spendchat";

export function Default() {
  return (
    <div className="grid w-64 gap-1.5">
      <Label htmlFor="date">Date</Label>
      <DatePicker id="date" value="2026-10-14" onChange={() => {}} />
    </div>
  );
}

export function Empty() {
  return (
    <div className="w-64">
      <DatePicker value="" onChange={() => {}} placeholder="Pick a date" />
    </div>
  );
}

export function Dense() {
  return (
    <div className="flex w-72 items-center gap-2">
      <DatePicker value="2026-10-01" onChange={() => {}} dense />
      <span className="text-sm text-muted-foreground">to</span>
      <DatePicker value="2026-10-31" onChange={() => {}} dense />
    </div>
  );
}
