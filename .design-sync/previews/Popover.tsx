import {
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "spendchat";
import { Info } from "lucide-react";

export function WithHeader() {
  return (
    <Popover defaultOpen modal={false}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Info />
          How balances work
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Balance</PopoverTitle>
          <PopoverDescription>
            Income minus expenses for the selected month, across every profile you
            can see in this workspace.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

export function Bare() {
  return (
    <Popover defaultOpen modal={false}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          Quick filters
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <div className="grid gap-1 text-sm">
          {["This month", "Last month", "Last 90 days", "This year"].map((f) => (
            <button
              key={f}
              className="rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              {f}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
