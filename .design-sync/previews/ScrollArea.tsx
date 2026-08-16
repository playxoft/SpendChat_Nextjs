import { ScrollArea, Separator } from "spendchat";

const CATEGORIES = [
  "🛒 Groceries", "🏠 Housing", "✈️ Travel", "🍽️ Eating out", "🚌 Transport",
  "💊 Health", "🎬 Entertainment", "📚 Education", "🎁 Gifts", "💡 Utilities",
  "👕 Clothing", "💰 Salary", "↔️ Transfers", "🧾 Taxes",
];

export function CategoryList() {
  return (
    <ScrollArea className="h-56 w-64 rounded-lg border">
      <div className="p-3">
        <h4 className="mb-2 text-sm font-medium">Categories</h4>
        {CATEGORIES.map((c) => (
          <div key={c}>
            <div className="py-1.5 text-sm">{c}</div>
            <Separator />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export function Horizontal() {
  return (
    <ScrollArea className="w-80 rounded-lg border whitespace-nowrap">
      <div className="flex gap-2 p-3">
        {["October", "September", "August", "July", "June", "May"].map((m) => (
          <div
            key={m}
            className="shrink-0 rounded-lg border px-4 py-6 text-sm tabular-nums"
          >
            {m}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
