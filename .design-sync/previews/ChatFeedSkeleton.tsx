import { ChatFeedSkeleton } from "spendchat";

export function Loading() {
  return (
    <div className="w-full max-w-md">
      <ChatFeedSkeleton />
    </div>
  );
}
