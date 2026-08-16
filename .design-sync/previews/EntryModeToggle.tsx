import { EntryModeToggle } from "spendchat";

// The composer's Manual / AI switch. AI is the one place the design system uses
// its blue→violet gradient, marking "this calls a model".
export function Manual() {
  return <EntryModeToggle mode="manual" onChange={() => {}} />;
}

export function Ai() {
  return <EntryModeToggle mode="ai" onChange={() => {}} />;
}

export function Dense() {
  return (
    <div className="flex items-center gap-4">
      <EntryModeToggle mode="manual" onChange={() => {}} dense />
      <EntryModeToggle mode="ai" onChange={() => {}} dense />
    </div>
  );
}
