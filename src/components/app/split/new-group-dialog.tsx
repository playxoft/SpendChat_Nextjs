"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { CurrencyCombobox } from "@/components/app/currency-combobox";
import { createSplitGroup } from "@/actions/split";
import { SPLIT_ADD_PEOPLE_MAX, SPLIT_GROUP_NAME_MAX } from "@/lib/validation";
import { EMPTY_PERSON, filledPeople, PeopleFields, type PersonDraft } from "./people-fields";
import { toastAdded } from "./added-toast";

const DEFAULT_ICON = "🧾";

/** Start a split group: name, icon, currency, and the first people to invite. */
export function NewGroupDialog({
  open,
  onOpenChange,
  defaultCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState(DEFAULT_ICON);
  const [currency, setCurrency] = React.useState(defaultCurrency);
  const [people, setPeople] = React.useState<PersonDraft[]>([EMPTY_PERSON]);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setIcon(DEFAULT_ICON);
      setCurrency(defaultCurrency);
      setPeople([EMPTY_PERSON]);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const members = filledPeople(people);
    if (members.some((p) => !p.name || !p.email)) {
      toast.error("Add a name and an email for everyone");
      return;
    }
    startTransition(async () => {
      const res = await createSplitGroup({ name: name.trim(), icon, currency, members });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toastAdded(res.added, new Map(members.map((m) => [m.email, m.name])));
      onOpenChange(false);
      router.push(`/app/split/${res.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            For a trip, a flat or a dinner. Everyone sees what was spent and who owes whom.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="split-group-name">Name & icon</Label>
            <div className="flex items-center gap-2">
              <EmojiPicker
                onSelect={setIcon}
                trigger={
                  <Button type="button" variant="outline" size="icon" aria-label="Pick an icon">
                    <span className="text-base">{icon}</span>
                  </Button>
                }
              />
              <Input
                id="split-group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Goa trip"
                maxLength={SPLIT_GROUP_NAME_MAX}
                autoFocus
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="split-group-currency">Currency</Label>
            <CurrencyCombobox id="split-group-currency" value={currency} onValueChange={setCurrency} />
            <p className="text-xs text-muted-foreground">
              Every amount in the group uses it. You can change it until the first expense.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>People</Label>
            <PeopleFields rows={people} onChange={setPeople} max={SPLIT_ADD_PEOPLE_MAX} />
            <p className="text-xs text-muted-foreground">
              Only you see their emails. You can add more people later — up to 50 including you.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
