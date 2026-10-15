import { Skeleton } from "@/components/ui/skeleton";
import { AccountControls } from "@/components/app/account-controls";

/**
 * Loading states for the invoices section, each shaped like the page it
 * stands in for. The three tabs' skeletons are content-only — their heading
 * and tabs come from the `(tabs)` layout, which stays on screen — and split
 * like the tabs themselves, a list and its panel.
 */

function ListRows({ rows = 4, trailing = true }: { rows?: number; trailing?: boolean }) {
  return (
    <div className="divide-y rounded-xl border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          {trailing && <Skeleton className="h-4 w-20" />}
        </div>
      ))}
    </div>
  );
}

/** The panel beside a tab's list, as it stands before anything is picked. */
function PanelShape() {
  return (
    <div className="hidden min-h-64 flex-col items-center justify-center gap-3 rounded-xl border p-6 lg:flex">
      <Skeleton className="size-10 rounded-full" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-8 w-40 rounded-lg" />
    </div>
  );
}

/** A tab's split: its list on the left, the panel on the right (as `SplitView`). */
function Split({ list }: { list: React.ReactNode }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="min-w-0">{list}</div>
      <PanelShape />
    </div>
  );
}

/** "Invoices & quotes": the two toggles, the meter and New buttons, then the list and its panel. */
export function DocumentsSkeleton() {
  return (
    <div className="space-y-3" aria-busy>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-48 rounded-full" />
          <Skeleton className="h-8 w-60 rounded-full" />
        </div>
        <Skeleton className="h-8 w-56 rounded-lg" />
      </div>
      <Split list={<ListRows />} />
    </div>
  );
}

/** "Clients": the count and New client over the list, and the panel. */
export function ClientsSkeleton() {
  return (
    <Split
      list={
        <div className="space-y-3" aria-busy>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
          <ListRows trailing={false} />
        </div>
      }
    />
  );
}

/** "Your details": the count and Add details over the sets, and the panel. */
export function DetailsSkeleton() {
  return (
    <Split
      list={
        <div className="space-y-3" aria-busy>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
          <div className="divide-y rounded-xl border">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-60" />
                </div>
              </div>
            ))}
          </div>
        </div>
      }
    />
  );
}

function PageHeader({ back = true, titleWidth = "w-40" }: { back?: boolean; titleWidth?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1.5">
        {back && <Skeleton className="h-4 w-20" />}
        <Skeleton className={`h-6 ${titleWidth}`} />
      </div>
      <AccountControls />
    </div>
  );
}

function Field({ wide = true }: { wide?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className={wide ? "h-9 w-full" : "h-9 w-1/2"} />
    </div>
  );
}

/** New invoice / Edit draft: the form beside the paper preview (stacked on phones). */
export function EditorSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6" aria-busy>
      <PageHeader />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-6">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-4 w-28" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field />
                <Field />
              </div>
              <Field />
            </div>
          ))}
        </div>
        <Skeleton className="aspect-[1/1.414] w-full rounded-xl" />
      </div>
    </div>
  );
}

/** One document: its actions, then the paper. */
export function DocumentViewSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6" aria-busy>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-52" />
        </div>
        <AccountControls />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="mx-auto aspect-[1/1.414] w-full max-w-[860px] rounded-xl" />
    </div>
  );
}

/** Bring an invoice in from the generator. */
export function ImportSkeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-6" aria-busy>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full max-w-sm" />
        </div>
        <AccountControls />
      </div>
      <div className="space-y-4 rounded-xl border p-4">
        <Field />
        <Field wide={false} />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    </div>
  );
}
