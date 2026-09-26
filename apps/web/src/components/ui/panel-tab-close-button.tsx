import { X } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

interface PanelTabCloseButtonProps {
  label: string;
  onClick: () => void;
  tooltip?: string;
}

/** Inside a `group/tab` row, a close "x" hidden until hover or focus of the tab. */
export function PanelTabCloseButton({ label, onClick, tooltip }: PanelTabCloseButtonProps) {
  const button = (
    <button
      type="button"
      className="cursor-pointer flex size-4 shrink-0 items-center justify-center rounded-sm opacity-0 hover:bg-muted focus-visible:opacity-100 group-hover/tab:opacity-100"
      aria-label={label}
      onClick={onClick}
    >
      <X className="size-3" />
    </button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup>{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
