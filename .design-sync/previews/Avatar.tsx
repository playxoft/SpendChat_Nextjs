import { Avatar, AvatarBadge, AvatarFallback } from "spendchat";
import { Check } from "lucide-react";

export function Sizes() {
  return (
    <div className="flex items-end gap-3">
      <Avatar size="sm">
        <AvatarFallback>NK</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>NK</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>NK</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function Fallbacks() {
  return (
    <div className="flex items-center gap-3">
      <Avatar>
        <AvatarFallback>PR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>AJ</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>🛒</AvatarFallback>
      </Avatar>
    </div>
  );
}

export function WithBadge() {
  return (
    <div className="flex items-end gap-4">
      <Avatar size="sm">
        <AvatarFallback>NK</AvatarFallback>
        <AvatarBadge />
      </Avatar>
      <Avatar>
        <AvatarFallback>PR</AvatarFallback>
        <AvatarBadge />
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>AJ</AvatarFallback>
        <AvatarBadge>
          <Check />
        </AvatarBadge>
      </Avatar>
    </div>
  );
}
