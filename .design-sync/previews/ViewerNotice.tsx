import { ViewerNotice } from "spendchat";

export function Card() {
  return (
    <div className="w-full max-w-md">
      <ViewerNotice />
    </div>
  );
}

export function Bar() {
  return (
    <div className="relative h-32 w-full max-w-md overflow-hidden rounded-lg border">
      <ViewerNotice variant="bar" className="sticky bottom-0" />
    </div>
  );
}
