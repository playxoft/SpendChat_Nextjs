import { Skeleton } from "spendchat";

export function Shapes() {
  return (
    <div className="grid max-w-sm gap-3">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-24 rounded-lg" />
      <Skeleton className="size-10 rounded-full" />
    </div>
  );
}

export function BubblePlaceholder() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className={i % 2 ? "flex flex-row-reverse gap-2" : "flex gap-2"}>
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-2 rounded-2xl border p-3">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
