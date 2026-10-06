"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { File, Folder, Loader2, RotateCcw, Trash2, UserRound } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteFromTrash, emptyTrash, listTrashPage, restoreFromTrash } from "@/actions/trash";
import { formatFileSize } from "@/lib/attachments";
import { fileTrashLock } from "@/lib/add-limits";
import { formatMoney, signedMinor } from "@/lib/money";
import { PLAN_LIMITS } from "@/lib/plans";
import {
  TRASH_DAYS,
  describeTrashCounts,
  trashCountdown,
  type TrashCounts,
  type TrashSelection,
  type TrashedFileDTO,
  type TrashedFolderDTO,
  type TrashedProfileDTO,
} from "@/lib/trash";
import type { TrashedTransactionRow } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { LimitPanel } from "../limit-lock";
import { usePlan } from "../upgrade-dialog";

type TxnRow = TrashedTransactionRow & { canRestore: boolean };
type Kind = "transaction" | "file" | "folder" | "profile";
type Key = `${Kind}:${string}`;

/** A selection's keys, grouped into what the trash actions take. */
function toSelection(keys: Iterable<Key>): TrashSelection {
  const sel: Required<TrashSelection> = {
    transactionIds: [],
    fileIds: [],
    folderIds: [],
    profileIds: [],
  };
  for (const key of keys) {
    const [kind, id] = key.split(":") as [Kind, string];
    sel[`${kind}Ids`].push(id);
  }
  return sel;
}

function deletedLine(deletedAt: Date | string, by: string | null): string {
  const ago = formatDistanceToNowStrict(new Date(deletedAt), { addSuffix: true });
  return by ? `Deleted ${ago} by ${by}` : `Deleted ${ago}`;
}

/** "Deletes in 27 days" — amber in the last few days, so it's noticed in time. */
function Countdown({ deletedAt }: { deletedAt: Date | string }) {
  const { days, label } = trashCountdown(deletedAt);
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 font-normal",
        days <= 3 && "border-amber-500/50 text-amber-700 dark:text-amber-400",
      )}
    >
      {label}
    </Badge>
  );
}

/** One trash row: a checkbox when it can be acted on, the item, its countdown. */
function TrashRow({
  checked,
  onCheckedChange,
  disabled,
  icon,
  title,
  meta,
  aside,
  deletedAt,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
  icon: React.ReactNode;
  /** The item's name — also the checkbox's accessible label. */
  title: string;
  meta: React.ReactNode;
  aside?: React.ReactNode;
  deletedAt: Date | string;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => onCheckedChange(c === true)}
        disabled={disabled}
        aria-label={disabled ? `${title} — you can't restore or delete this one` : `Select ${title}`}
      />
      <span aria-hidden className="text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      {aside ? <span className="hidden shrink-0 text-sm tabular-nums sm:inline">{aside}</span> : null}
      <Countdown deletedAt={deletedAt} />
    </li>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function TrashPageClient({
  rows: initialRows,
  nextCursor: initialCursor,
  folders,
  files,
  profiles,
  counts,
  trashBytes,
  isAdmin,
  currency,
  locale,
}: {
  rows: TxnRow[];
  nextCursor: string | null;
  folders: TrashedFolderDTO[];
  files: TrashedFileDTO[];
  profiles: TrashedProfileDTO[];
  counts: TrashCounts;
  trashBytes: number;
  isAdmin: boolean;
  currency: string;
  locale: string;
}) {
  const router = useRouter();
  const { plan, reportFailure } = usePlan();
  const [rows, setRows] = React.useState(initialRows);
  const [cursor, setCursor] = React.useState(initialCursor);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<Key>>(new Set());
  const [confirm, setConfirm] = React.useState<"delete" | "empty" | null>(null);
  const [pending, startTransition] = React.useTransition();

  // A refresh after restoring or deleting brings new server data; start over
  // from it. Reset while rendering (React's "adjusting state when a prop
  // changes"), not in an effect, so the stale list never paints.
  const [source, setSource] = React.useState(initialRows);
  if (source !== initialRows) {
    setSource(initialRows);
    setRows(initialRows);
    setCursor(initialCursor);
    setSelected(new Set());
  }

  const fileTrash = PLAN_LIMITS[plan].fileTrash;
  const emptyTotal = counts.transactions + counts.files + counts.folders + counts.profiles;
  const selection = toSelection(selected);

  const toggle = (key: Key) => (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    void listTrashPage(cursor)
      .then((res) => {
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setRows((prev) => [...prev, ...res.rows]);
        setCursor(res.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  }

  function restore() {
    startTransition(async () => {
      const res = await restoreFromTrash(selection);
      if (!res.ok) return reportFailure(res);
      const what = describeTrashCounts(res.counts);
      if (what) toast.success(`Restored ${what}`);
      if (res.skipped > 0) {
        toast.info(`${res.skipped} item${res.skipped === 1 ? "" : "s"} couldn't be restored`);
      }
      router.refresh();
    });
  }

  function deleteSelected() {
    startTransition(async () => {
      const res = await deleteFromTrash(selection);
      setConfirm(null);
      if (!res.ok) return reportFailure(res);
      const what = describeTrashCounts(res.counts);
      if (what) toast.success(`Deleted ${what} for good`);
      router.refresh();
    });
  }

  function emptyAll() {
    startTransition(async () => {
      const total: TrashCounts = { transactions: 0, files: 0, folders: 0, profiles: 0 };
      // Each call empties a bounded batch; keep going until nothing is left
      // (with a ceiling, so a trash being refilled can't loop forever).
      for (let round = 0; round < 50; round++) {
        const res = await emptyTrash();
        if (!res.ok) {
          setConfirm(null);
          reportFailure(res);
          router.refresh();
          return;
        }
        total.transactions += res.counts.transactions;
        total.files += res.counts.files;
        total.folders += res.counts.folders;
        total.profiles += res.counts.profiles;
        if (res.remaining === 0) break;
      }
      setConfirm(null);
      toast.success(`Emptied the trash — ${describeTrashCounts(total) || "nothing"} deleted for good`);
      router.refresh();
    });
  }

  const selectedCount = selected.size;
  const showProfiles = isAdmin && profiles.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Trash</h1>
          <p className="text-sm text-muted-foreground">
            Deleted items wait here for {TRASH_DAYS} days, then they’re gone for good.
            {trashBytes > 0
              ? ` They use ${formatFileSize(trashBytes)} of your storage until then.`
              : null}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={pending || emptyTotal === 0}
          onClick={() => setConfirm("empty")}
        >
          <Trash2 className="size-4" />
          Empty trash
        </Button>
      </div>

      {selectedCount > 0 && (
        <div
          role="region"
          aria-label="Selected items"
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2"
        >
          <span className="text-sm">{selectedCount} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={pending}>
              Clear
            </Button>
            <Button size="sm" variant="outline" onClick={restore} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Restore
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirm("delete")} disabled={pending}>
              Delete forever
            </Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="transactions" onValueChange={() => setSelected(new Set())}>
        <TabsList>
          <TabsTrigger value="transactions">
            Transactions{rows.length > 0 ? ` · ${rows.length}${cursor ? "+" : ""}` : ""}
          </TabsTrigger>
          <TabsTrigger value="files">
            Files{folders.length + files.length > 0 ? ` · ${folders.length + files.length}` : ""}
          </TabsTrigger>
          {showProfiles && <TabsTrigger value="profiles">Profiles · {profiles.length}</TabsTrigger>}
        </TabsList>

        <TabsContent value="transactions" className="space-y-3">
          {rows.length === 0 ? (
            <EmptyState>No deleted transactions. When you delete one, it waits here for {TRASH_DAYS} days.</EmptyState>
          ) : (
            <ul className="divide-y rounded-lg border">
              {rows.map((r) => (
                <TrashRow
                  key={r.id}
                  checked={selected.has(`transaction:${r.id}`)}
                  onCheckedChange={toggle(`transaction:${r.id}`)}
                  disabled={!r.canRestore || pending}
                  icon={<span className="text-base">{r.categoryIcon ?? "•"}</span>}
                  title={r.title || r.categoryName || "Untitled"}
                  meta={[r.profileName, r.occurredOn, deletedLine(r.deletedAt, r.deletedByName)]
                    .filter(Boolean)
                    .join(" · ")}
                  aside={
                    <span className={cn(r.type === "income" && "text-emerald-600 dark:text-emerald-400")}>
                      {formatMoney(signedMinor(r.type, r.amountMinor), currency, locale, { signed: true })}
                    </span>
                  }
                  deletedAt={r.deletedAt}
                />
              ))}
            </ul>
          )}
          {cursor && (
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
                Show more
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="files" className="space-y-3">
          {!fileTrash && <LimitPanel lock={fileTrashLock(plan)} />}
          {folders.length + files.length === 0 ? (
            <EmptyState>
              {fileTrash
                ? `No deleted files. When you delete a file or folder, it waits here for ${TRASH_DAYS} days.`
                : "Nothing here — on this plan, deleted files and folders are removed straight away."}
            </EmptyState>
          ) : (
            <ul className="divide-y rounded-lg border">
              {folders.map((f) => (
                <TrashRow
                  key={f.id}
                  checked={selected.has(`folder:${f.id}`)}
                  onCheckedChange={toggle(`folder:${f.id}`)}
                  disabled={!f.canRestore || pending}
                  icon={<Folder className="size-4" style={f.color ? { color: f.color } : undefined} />}
                  title={f.name}
                  meta={[
                    f.profileName,
                    `${f.files} file${f.files === 1 ? "" : "s"}${f.folders > 0 ? `, ${f.folders} folder${f.folders === 1 ? "" : "s"}` : ""}`,
                    deletedLine(f.deletedAt, f.deletedByName),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  aside={formatFileSize(f.sizeBytes)}
                  deletedAt={f.deletedAt}
                />
              ))}
              {files.map((f) => (
                <TrashRow
                  key={f.id}
                  checked={selected.has(`file:${f.id}`)}
                  onCheckedChange={toggle(`file:${f.id}`)}
                  disabled={!f.canRestore || pending}
                  icon={<File className="size-4" />}
                  title={f.name}
                  meta={[f.profileName, deletedLine(f.deletedAt, f.deletedByName)].filter(Boolean).join(" · ")}
                  aside={formatFileSize(f.sizeBytes)}
                  deletedAt={f.deletedAt}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        {showProfiles && (
          <TabsContent value="profiles" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Restoring a profile brings back everything that was in it.
            </p>
            <ul className="divide-y rounded-lg border">
              {profiles.map((p) => (
                <TrashRow
                  key={p.id}
                  checked={selected.has(`profile:${p.id}`)}
                  onCheckedChange={toggle(`profile:${p.id}`)}
                  disabled={pending}
                  icon={p.icon ? <span className="text-base">{p.icon}</span> : <UserRound className="size-4" />}
                  title={p.name}
                  meta={[
                    p.spaceName,
                    `${p.transactions} transaction${p.transactions === 1 ? "" : "s"}, ${p.files} file${p.files === 1 ? "" : "s"}`,
                    deletedLine(p.deletedAt, p.deletedByName),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  aside={p.sizeBytes > 0 ? formatFileSize(p.sizeBytes) : undefined}
                  deletedAt={p.deletedAt}
                />
              ))}
            </ul>
          </TabsContent>
        )}
      </Tabs>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && !pending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "empty" ? "Empty the trash?" : `Delete ${selectedCount} item${selectedCount === 1 ? "" : "s"} for good?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "empty"
                ? `${describeTrashCounts(counts) || "Everything you can delete here"} will be deleted for good, with any files attached. This can’t be undone.`
                : "They’re deleted for good, with any files inside or attached. This can’t be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirm === "empty") emptyAll();
                else deleteSelected();
              }}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {confirm === "empty" ? "Empty trash" : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
