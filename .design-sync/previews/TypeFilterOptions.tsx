import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
  TypeFilterOptions,
} from "spendchat";

// TypeFilterOptions is a fragment of <SelectItem>s — it only renders inside a
// SelectContent, so both stories compose it into a real Select.
export function Closed() {
  return (
    <Select defaultValue="all">
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <TypeFilterOptions />
      </SelectContent>
    </Select>
  );
}

export function Open() {
  return (
    <Select defaultValue="income" open>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={6}>
        <TypeFilterOptions />
      </SelectContent>
    </Select>
  );
}
