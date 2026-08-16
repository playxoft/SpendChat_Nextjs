import { Button } from "spendchat";
import { Plus, Download, Trash2 } from "lucide-react";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button>Add expense</Button>
      <Button variant="outline">Filter</Button>
      <Button variant="secondary">This month</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="destructive">Delete</Button>
      <Button variant="link">View all transactions</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="xs">xs</Button>
      <Button size="sm">sm</Button>
      <Button size="default">default</Button>
      <Button size="lg">lg</Button>
    </div>
  );
}

export function WithIcons() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button>
        <Plus />
        New transaction
      </Button>
      <Button variant="outline">
        <Download />
        Export CSV
      </Button>
      <Button variant="destructive">
        <Trash2 />
        Delete profile
      </Button>
    </div>
  );
}

export function IconOnly() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="icon-xs" variant="ghost" aria-label="Add">
        <Plus />
      </Button>
      <Button size="icon-sm" variant="outline" aria-label="Add">
        <Plus />
      </Button>
      <Button size="icon" aria-label="Add">
        <Plus />
      </Button>
      <Button size="icon-lg" variant="secondary" aria-label="Add">
        <Plus />
      </Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled>Add expense</Button>
      <Button variant="outline" disabled>
        Filter
      </Button>
      <Button variant="destructive" disabled>
        Delete
      </Button>
    </div>
  );
}
