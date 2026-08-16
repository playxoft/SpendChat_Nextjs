import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "spendchat";

// `defaultOpen` keeps the overlay mounted so the card captures the real state.
export function DeleteTransaction() {
  return (
    <AlertDialog defaultOpen>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
          <AlertDialogDescription>
            “Weekly groceries — ₹1,240.00” will be removed from the October feed.
            This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function EmptyVault() {
  return (
    <AlertDialog defaultOpen>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Empty the vault?</AlertDialogTitle>
          <AlertDialogDescription>
            All 128 files (612 MB) will be permanently deleted, including receipts
            still linked to transactions.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep files</AlertDialogCancel>
          <AlertDialogAction>Delete everything</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
