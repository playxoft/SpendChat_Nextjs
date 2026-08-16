import { AttachmentSquares } from "spendchat";

const ATTACHMENTS = [
  { id: "1", fileName: "October-rent-receipt.pdf", contentType: "application/pdf", kind: "receipt" as const, sizeBytes: 188_416 },
  { id: "2", fileName: "Big-Bazaar-14-Oct.jpg", contentType: "image/jpeg", kind: "bill" as const, sizeBytes: 1_258_291 },
  { id: "3", fileName: "IndiGo-6E-274.pdf", contentType: "application/pdf", kind: "invoice" as const, sizeBytes: 98_304 },
  { id: "4", fileName: "Metro-card.png", contentType: "image/png", kind: null, sizeBytes: 42_000 },
  { id: "5", fileName: "Warranty.pdf", contentType: "application/pdf", kind: null, sizeBytes: 71_000 },
];

// The compact cell renderer used in the transactions table.
export function Squares() {
  return (
    <div className="grid gap-4 text-sm">
      <div className="flex items-center gap-6">
        <span className="w-24 text-muted-foreground">One file</span>
        <AttachmentSquares attachments={ATTACHMENTS.slice(0, 1)} onOpen={() => {}} />
      </div>
      <div className="flex items-center gap-6">
        <span className="w-24 text-muted-foreground">Three files</span>
        <AttachmentSquares attachments={ATTACHMENTS.slice(0, 3)} onOpen={() => {}} />
      </div>
      <div className="flex items-center gap-6">
        <span className="w-24 text-muted-foreground">Overflowing</span>
        <AttachmentSquares attachments={ATTACHMENTS} onOpen={() => {}} />
      </div>
      <div className="flex items-center gap-6">
        <span className="w-24 text-muted-foreground">None</span>
        <AttachmentSquares attachments={[]} onOpen={() => {}} />
      </div>
    </div>
  );
}
