import { AttachmentTile } from "spendchat";

export function States() {
  return (
    <div className="grid w-80 gap-2">
      <AttachmentTile
        fileName="October-rent-receipt.pdf"
        contentType="application/pdf"
        sizeBytes={188_416}
        label="Rent receipt"
        kind="receipt"
        onOpen={() => {}}
      />
      <AttachmentTile
        fileName="Big-Bazaar-14-Oct.jpg"
        contentType="image/jpeg"
        sizeBytes={1_258_291}
        label={null}
        kind="bill"
        status="uploading"
      />
      <AttachmentTile
        fileName="IndiGo-6E-274.pdf"
        contentType="application/pdf"
        sizeBytes={98_304}
        label="Flight invoice"
        kind="invoice"
        status="error"
        errorMessage="Upload failed — file is over the 5 MB limit"
      />
    </div>
  );
}

export function Editable() {
  return (
    <div className="grid w-80 gap-2">
      <AttachmentTile
        fileName="October-rent-receipt.pdf"
        contentType="application/pdf"
        sizeBytes={188_416}
        label="Rent receipt"
        kind="receipt"
        editable
        onOpen={() => {}}
        onSave={() => {}}
        onRemove={() => {}}
      />
    </div>
  );
}
