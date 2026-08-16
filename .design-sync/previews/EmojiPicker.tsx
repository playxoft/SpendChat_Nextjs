import { Button, EmojiPicker, Input, Label } from "spendchat";

// Only the closed trigger is previewed. `EmojiPickerPanel` streams Emojibase
// data from the app's own `/emojibase` path, which exists only inside the Next
// app — in a standalone bundle that request never resolves, so a story that
// mounts the open panel hangs the capture and would ship a "Loading…" card.
// The trigger is what a design composes with; the grid appears on click at
// runtime wherever the app serves that data.
export function CategoryIcon() {
  return (
    <div className="grid w-72 gap-1.5">
      <Label htmlFor="cat-name">Category</Label>
      <div className="flex items-center gap-2">
        <EmojiPicker
          onSelect={() => {}}
          trigger={
            <Button variant="outline" size="icon" aria-label="Pick an icon">
              🛒
            </Button>
          }
        />
        <Input id="cat-name" defaultValue="Groceries" />
      </div>
      <p className="text-xs text-muted-foreground">
        Click the icon to choose a different emoji.
      </p>
    </div>
  );
}

export function ProfileIcons() {
  return (
    <div className="grid w-72 gap-2">
      {[
        ["🏠", "Personal"],
        ["👨‍👩‍👧", "Household"],
        ["💼", "Business"],
      ].map(([emoji, name]) => (
        <div key={name} className="flex items-center gap-2 rounded-lg border p-2">
          <EmojiPicker
            onSelect={() => {}}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Icon for ${name}`}>
                {emoji}
              </Button>
            }
          />
          <span className="text-sm font-medium">{name}</span>
        </div>
      ))}
    </div>
  );
}
