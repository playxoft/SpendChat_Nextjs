import { Label, PasswordInput } from "spendchat";

export function Default() {
  return (
    <div className="grid max-w-xs gap-1.5">
      <Label htmlFor="pw">Password</Label>
      <PasswordInput id="pw" placeholder="••••••••" />
    </div>
  );
}

export function Filled() {
  return (
    <div className="grid max-w-xs gap-1.5">
      <Label htmlFor="pw2">New password</Label>
      <PasswordInput id="pw2" defaultValue="correct-horse-battery" />
      <p className="text-xs text-muted-foreground">
        The eye toggle reveals the value; it stays a password field otherwise.
      </p>
    </div>
  );
}

export function Invalid() {
  return (
    <div className="grid max-w-xs gap-1.5">
      <Label htmlFor="pw3">Password</Label>
      <PasswordInput id="pw3" defaultValue="short" aria-invalid />
      <p className="text-xs text-destructive">Use at least 8 characters.</p>
    </div>
  );
}
