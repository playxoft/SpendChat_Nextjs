import { TransactionComposer } from "spendchat";

const CATEGORIES = [
  { id: "c1", name: "Groceries", icon: "🛒", kind: "expense" as const },
  { id: "c2", name: "Housing", icon: "🏠", kind: "expense" as const },
  { id: "c3", name: "Travel", icon: "✈️", kind: "expense" as const },
  { id: "c4", name: "Eating out", icon: "🍽️", kind: "expense" as const },
  { id: "c5", name: "Salary", icon: "💰", kind: "income" as const },
];

const PROFILES = [
  { id: "p1", name: "Personal", icon: "🏠" },
  { id: "p2", name: "Household", icon: "👨‍👩‍👧" },
];

const BASE = {
  categories: CATEGORIES,
  currency: "INR",
  locale: "en-IN",
  today: "2026-10-16",
  profiles: PROFILES,
  activeProfileId: "p1",
  voiceLanguages: ["en-IN", "ml-IN"],
};

export function Manual() {
  return (
    <div className="w-full max-w-2xl">
      <TransactionComposer {...BASE} />
    </div>
  );
}

export function CombinedInput() {
  return (
    <div className="w-full max-w-2xl">
      <TransactionComposer {...BASE} inputMode="combined" />
    </div>
  );
}

export function CompactDensity() {
  return (
    <div className="w-full max-w-2xl">
      <TransactionComposer {...BASE} density="compact" />
    </div>
  );
}

export function AllProfiles() {
  return (
    <div className="w-full max-w-2xl">
      <TransactionComposer {...BASE} activeProfileId={undefined} allProfiles />
    </div>
  );
}
