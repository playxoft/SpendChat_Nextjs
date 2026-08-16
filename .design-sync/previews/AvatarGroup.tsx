import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "spendchat";

export function Members() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>NK</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>PR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>AJ</AvatarFallback>
      </Avatar>
    </AvatarGroup>
  );
}

export function WithOverflow() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>NK</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>PR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>AJ</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+4</AvatarGroupCount>
    </AvatarGroup>
  );
}

export function Small() {
  return (
    <AvatarGroup>
      <Avatar size="sm">
        <AvatarFallback>NK</AvatarFallback>
      </Avatar>
      <Avatar size="sm">
        <AvatarFallback>PR</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+2</AvatarGroupCount>
    </AvatarGroup>
  );
}
