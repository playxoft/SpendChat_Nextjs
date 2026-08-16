import { DateRangeFilter } from "spendchat";

export function Range() {
  return (
    <DateRangeFilter
      from="2026-10-01"
      to="2026-10-31"
      today="2026-10-16"
      locale="en-IN"
      onChange={() => {}}
    />
  );
}

export function Empty() {
  return (
    <DateRangeFilter
      from=""
      to=""
      today="2026-10-16"
      locale="en-IN"
      onChange={() => {}}
    />
  );
}
