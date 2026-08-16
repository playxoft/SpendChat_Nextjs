import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "spendchat";

// `defaultOpen` keeps the overlay mounted so the card captures the real open
// state — a trigger-only story renders an empty cell.
export function EditTransaction() {
  return (
    <Dialog defaultOpen modal={false}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit transaction</DialogTitle>
          <DialogDescription>
            Update the amount, category or note. Changes apply immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" defaultValue="1,240.00" inputMode="decimal" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="note">Note</Label>
            <Input id="note" defaultValue="Weekly groceries — Big Bazaar" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Confirm() {
  return (
    <Dialog defaultOpen modal={false}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Leave “Household”?</DialogTitle>
          <DialogDescription>
            You’ll lose access to its profiles and transactions. An admin can invite
            you back later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost">Stay</Button>
          <Button variant="destructive">Leave workspace</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
