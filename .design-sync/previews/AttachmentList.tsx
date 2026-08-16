import { AttachmentList } from "spendchat";

const ATTACHMENTS = [
  {
    id: "1",
    fileName: "October-rent-receipt.pdf",
    contentType: "application/pdf",
    label: "Rent receipt",
    kind: "receipt" as const,
    sizeBytes: 188_416,
  },
  {
    id: "2",
    fileName: "Big-Bazaar-14-Oct.jpg",
    contentType: "image/jpeg",
    label: null,
    kind: "bill" as const,
    sizeBytes: 1_258_291,
  },
  {
    id: "3",
    fileName: "IndiGo-6E-274.pdf",
    contentType: "application/pdf",
    label: "Flight invoice",
    kind: "invoice" as const,
    sizeBytes: 98_304,
  },
];

export function Several() {
  return (
    <div className="w-80 rounded-lg border p-3">
      <AttachmentList attachments={ATTACHMENTS} onOpen={() => {}} />
    </div>
  );
}

export function Single() {
  return (
    <div className="w-80 rounded-lg border p-3">
      <AttachmentList attachments={ATTACHMENTS.slice(0, 1)} onOpen={() => {}} />
    </div>
  );
}
