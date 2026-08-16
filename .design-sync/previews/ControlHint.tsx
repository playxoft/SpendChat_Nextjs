import { Button, ControlHint } from "spendchat";
import { Paperclip, Printer, Send } from "lucide-react";

// ControlHint wraps a control in a Tooltip that can carry a shortcut chip.
// Tooltips only open on hover, so these cells show the controls it wraps.
export function ToolbarControls() {
  return (
    <div className="flex items-center gap-2">
      <ControlHint label="Attach a receipt">
        <Button variant="ghost" size="icon" aria-label="Attach">
          <Paperclip />
        </Button>
      </ControlHint>
      <ControlHint label="Print statement" combo="mod+p">
        <Button variant="ghost" size="icon" aria-label="Print">
          <Printer />
        </Button>
      </ControlHint>
      <ControlHint label="Send transaction" combo="mod+enter">
        <Button size="icon" aria-label="Send">
          <Send />
        </Button>
      </ControlHint>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex items-center gap-3">
      {/* enabled={false} renders the child bare — no tooltip wrapper at all. */}
      <ControlHint label="Not shown" enabled={false}>
        <Button variant="outline" size="sm">
          No hint
        </Button>
      </ControlHint>
      <ControlHint label="Has a hint" combo="mod+e">
        <Button variant="outline" size="sm">
          With hint
        </Button>
      </ControlHint>
    </div>
  );
}
