import { Badge } from "spendchat";
import { Check, Clock, Paperclip } from "lucide-react";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Admin</Badge>
      <Badge variant="secondary">Editor</Badge>
      <Badge variant="outline">Viewer</Badge>
      <Badge variant="destructive">Over budget</Badge>
      <Badge variant="ghost">Draft</Badge>
      <Badge variant="link">Details</Badge>
    </div>
  );
}

export function WithIcons() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">
        <Check />
        Settled
      </Badge>
      <Badge variant="outline">
        <Clock />
        Pending
      </Badge>
      <Badge variant="outline">
        <Paperclip />3
      </Badge>
    </div>
  );
}

export function Categories() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">🛒 Groceries</Badge>
      <Badge variant="outline">🏠 Housing</Badge>
      <Badge variant="outline">✈️ Travel</Badge>
      <Badge variant="outline">🍽️ Eating out</Badge>
      <Badge variant="outline">💰 Salary</Badge>
    </div>
  );
}
