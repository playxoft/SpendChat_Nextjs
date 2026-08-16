import { Button, Kbd, Tooltip, TooltipContent, TooltipTrigger } from "spendchat";
import { Mic, Paperclip } from "lucide-react";

// TooltipProvider comes from the design system's provider wrapper, so stories
// only need Tooltip itself. `defaultOpen` renders the bubble in the card.
export function Default() {
  return (
    <div className="pt-16">
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Attach">
            <Paperclip />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Attach a receipt</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function WithShortcut() {
  return (
    <div className="pt-16">
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Voice">
            <Mic />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          Hold to dictate
          <Kbd combo="m" />
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
