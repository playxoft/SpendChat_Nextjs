import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "spendchat";

export function Default() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>October spending</CardTitle>
        <CardDescription>1 Oct – 31 Oct 2026</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">₹48,250.00</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Down 12% from September. Groceries and rent account for most of it.
        </p>
      </CardContent>
    </Card>
  );
}

export function WithAction() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Household</CardTitle>
        <CardDescription>Shared with 3 members</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Manage
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Everyone in this workspace sees amounts in ₹ (en-IN).
        </p>
      </CardContent>
    </Card>
  );
}

export function WithFooter() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Delete this profile?</CardTitle>
        <CardDescription>
          412 transactions are attached to “Personal”. Choose what happens to them
          before the profile is removed.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex justify-end gap-2 border-t py-3">
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
        <Button variant="destructive" size="sm">
          Delete profile
        </Button>
      </CardFooter>
    </Card>
  );
}

export function Small() {
  return (
    <Card size="sm" className="max-w-xs">
      <CardHeader>
        <CardTitle>Storage</CardTitle>
        <CardDescription>612 MB of 1 GB used</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[61%] rounded-full bg-primary" />
        </div>
      </CardContent>
    </Card>
  );
}
