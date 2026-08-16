import {
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "spendchat";

export function Closed() {
  return (
    <div className="grid max-w-xs gap-1.5">
      <Label htmlFor="profile">Profile</Label>
      <Select defaultValue="personal">
        <SelectTrigger id="profile" className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="personal">Personal</SelectItem>
          <SelectItem value="household">Household</SelectItem>
          <SelectItem value="business">Business</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// `open` keeps the listbox mounted so the card shows the real menu surface.
// `position="popper"` anchors it below the trigger — the default item-aligned
// placement overlays the trigger and clips the first group label in a card.
export function Open() {
  return (
    <Select defaultValue="groceries" open>
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={6}>
        <SelectGroup>
          <SelectLabel>Spending</SelectLabel>
          <SelectItem value="groceries">🛒 Groceries</SelectItem>
          <SelectItem value="housing">🏠 Housing</SelectItem>
          <SelectItem value="travel">✈️ Travel</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Income</SelectLabel>
          <SelectItem value="salary">💰 Salary</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function Disabled() {
  return (
    <Select defaultValue="inr" disabled>
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="inr">INR — Indian Rupee</SelectItem>
      </SelectContent>
    </Select>
  );
}
