import { Separator } from "spendchat";

export function Horizontal() {
  return (
    <div className="max-w-sm">
      <div className="grid gap-1">
        <h4 className="text-sm font-medium">Household</h4>
        <p className="text-sm text-muted-foreground">
          Shared workspace · ₹ (en-IN)
        </p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center gap-3 text-sm">
        <span>Profiles</span>
        <Separator orientation="vertical" />
        <span>Members</span>
        <Separator orientation="vertical" />
        <span>Categories</span>
      </div>
    </div>
  );
}

export function InList() {
  return (
    <div className="w-64 rounded-lg border">
      {[
        ["Groceries", "₹6,180"],
        ["Housing", "₹32,000"],
        ["Travel", "₹4,780"],
      ].map(([c, amount], i, a) => (
        <div key={c}>
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <span>{c}</span>
            <span className="tabular-nums text-muted-foreground">{amount}</span>
          </div>
          {i < a.length - 1 ? <Separator /> : null}
        </div>
      ))}
    </div>
  );
}
