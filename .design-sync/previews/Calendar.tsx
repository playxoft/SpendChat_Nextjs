import { Calendar } from "spendchat";

export function SingleDate() {
  return <Calendar selected="2026-10-14" onSelect={() => {}} />;
}

export function DateRange() {
  return (
    <Calendar
      selectionMode="range"
      startDate="2026-10-05"
      endDate="2026-10-19"
      onRangeSelect={() => {}}
    />
  );
}

export function Bounded() {
  return (
    <Calendar
      selected="2026-10-14"
      min="2026-10-08"
      max="2026-10-24"
      onSelect={() => {}}
    />
  );
}
