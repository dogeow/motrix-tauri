import { Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

interface SelectionToolbarProps {
  count: number;
  onStart: () => void;
  onPause: () => void;
  onRemove: () => void;
  onClear: () => void;
}

export function SelectionToolbar({
  count,
  onStart,
  onPause,
  onRemove,
  onClear,
}: SelectionToolbarProps) {
  if (count === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-accent/40 px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">
        {t("selection.count", { count })}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onStart}>
          <Play className="size-3.5" /> {t("common.start")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onPause}>
          <Pause className="size-3.5" /> {t("common.pause")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" /> {t("common.delete")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear}>
          {t("selection.clear")}
        </Button>
      </div>
    </div>
  );
}
