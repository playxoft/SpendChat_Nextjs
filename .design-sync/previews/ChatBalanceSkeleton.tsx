import { ChatBalanceSkeleton } from "spendchat";

export function Loading() {
  return (
    <div className="w-full max-w-md rounded-lg border p-3">
      <ChatBalanceSkeleton />
    </div>
  );
}
