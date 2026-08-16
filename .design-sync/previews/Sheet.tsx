import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "spendchat";

export function Filters() {
  return (
    <Sheet defaultOpen modal={false}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the October feed.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 px-4 text-sm">
          {["Type", "Category", "Profile", "Date range"].map((f) => (
            <div key={f} className="flex items-center justify-between">
              <span className="text-muted-foreground">{f}</span>
              <span>Any</span>
            </div>
          ))}
        </div>
        <SheetFooter>
          <Button>Apply</Button>
          <SheetClose asChild>
            <Button variant="ghost">Reset</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function BottomSheet() {
  return (
    <Sheet defaultOpen modal={false}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Add transaction</SheetTitle>
          <SheetDescription>Quick entry on mobile.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
