import { Toaster } from "spendchat";

// Toaster is the mount point — it renders nothing until `toast()` is called, so
// a card can only show it in place. Sonner keeps its own portal, and the card
// documents where the component belongs rather than faking a notification.
export function MountPoint() {
  return (
    <div className="grid w-80 gap-3">
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Toaster</p>
        <p className="mt-1">
          Mount once near the app root. Trigger notifications from anywhere with{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            toast.success(&quot;Transaction saved&quot;)
          </code>{" "}
          from <code className="font-mono text-xs">sonner</code>.
        </p>
      </div>
      <Toaster />
    </div>
  );
}
