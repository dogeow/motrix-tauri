import { Fragment, type ReactNode } from "react";
import {
  CircleCheck,
  Copy,
  Download,
  EllipsisVertical,
  FolderOpen,
  Info,
  LoaderCircle,
  Magnet,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  copyTaskLink,
  pauseTask,
  resumeTask,
  retryTask,
  revealTask,
  toastError,
} from "@/lib/actions";
import {
  formatBytes,
  formatEta,
  formatSpeed,
  taskName,
  taskProgress,
} from "@/lib/format";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Aria2Task } from "@/lib/types";

interface TaskItemProps {
  task: Aria2Task;
  selected: boolean;
  onSelectedChange: (task: Aria2Task, selected: boolean) => void;
  onRemove: (task: Aria2Task) => void;
  onInspect: (task: Aria2Task) => void;
}

export function TaskItem({
  task,
  selected,
  onSelectedChange,
  onRemove,
  onInspect,
}: TaskItemProps) {
  const name = taskName(task);
  const progress = taskProgress(task);
  const isBt = Boolean(task.bittorrent);
  const running = task.status === "active";
  const paused = task.status === "paused";
  const complete = task.status === "complete";
  const errored = task.status === "error";
  const total = Number(task.totalLength);
  const verifying = task.verifiedLength !== undefined;
  const verifyPending = task.verifyIntegrityPending === "true";
  const verified = Number(task.verifiedLength ?? 0);
  const verifyProgress =
    total > 0 ? Math.min(100, (verified / total) * 100) : 0;
  const visibleProgress = verifying ? verifyProgress : progress;
  const seeding =
    running && isBt && total > 0 && task.completedLength === task.totalLength;

  const handleToggle = async () => {
    try {
      if (running) await pauseTask(task);
      else if (paused) await resumeTask(task);
    } catch (error) {
      toastError(error);
    }
  };

  const handleCopy = async () => {
    try {
      const copied = await copyTaskLink(task);
      if (copied) toast.success(t("task.linkCopied"));
      else toast.info(t("task.noLink"));
    } catch (error) {
      toastError(error);
    }
  };

  const handleRetry = async () => {
    try {
      await retryTask(task);
      toast.success(t("task.requeued"));
    } catch (error) {
      toastError(error);
    }
  };

  const meta: ReactNode[] = [];
  if (verifying) {
    meta.push(
      t("task.verified", {
        verified: formatBytes(verified),
        total: formatBytes(total),
      })
    );
    if (total > 0) meta.push(`${verifyProgress.toFixed(1)}%`);
  } else if (complete) {
    meta.push(formatBytes(task.totalLength));
  } else {
    meta.push(
      `${formatBytes(task.completedLength)} / ${formatBytes(task.totalLength)}`
    );
    if (total > 0) meta.push(`${progress.toFixed(1)}%`);
  }
  if (running && !verifying && !verifyPending) {
    meta.push(`↓ ${formatSpeed(task.downloadSpeed)}`);
    if (isBt) {
      meta.push(`↑ ${formatSpeed(task.uploadSpeed)}`);
    }
    if (!seeding) meta.push(t("task.eta", { eta: formatEta(task) }));
    if (isBt) meta.push(
      t("task.connections", {
        count: `${task.numSeeders ?? 0}/${task.connections}`,
      })
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        selected ? "bg-accent" : "hover:bg-accent/50"
      )}
      onDoubleClick={() => onInspect(task)}
    >
      {/* The type icon gives way to a checkbox on hover or when selected. */}
      <div className="relative size-9 shrink-0">
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-md transition-opacity group-hover:opacity-0",
            selected && "opacity-0",
            errored
              ? "bg-destructive/10 text-destructive"
              : complete
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
          )}
        >
          {errored ? (
            <TriangleAlert className="size-4" />
          ) : complete ? (
            <CircleCheck className="size-4" />
          ) : isBt ? (
            <Magnet className="size-4" />
          ) : (
            <Download className="size-4" />
          )}
        </div>
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-100",
            !selected && "opacity-0"
          )}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) =>
              onSelectedChange(task, checked === true)
            }
            aria-label={t("task.select", { name })}
          />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium" title={name}>
            {name}
          </span>
          {seeding && (
            <Badge variant="secondary" className="shrink-0">
              {t("status.seeding")}
            </Badge>
          )}
          {verifying && (
            <Badge variant="secondary" className="shrink-0">
              <LoaderCircle className="animate-spin" />
              {t("status.verifying")}
            </Badge>
          )}
          {verifyPending && (
            <Badge variant="outline" className="shrink-0">
              {t("status.verifyPending")}
            </Badge>
          )}
          {paused && (
            <Badge variant="outline" className="shrink-0">
              {t("status.paused")}
            </Badge>
          )}
        </div>

        {!complete && !errored && (
          <Progress value={visibleProgress} className="mt-2 h-1" />
        )}

        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs tabular-nums text-muted-foreground">
          {meta.map((item, index) => (
            <Fragment key={index}>
              {index > 0 && <span className="opacity-40">·</span>}
              <span className="min-w-0">{item}</span>
            </Fragment>
          ))}
        </div>
        {errored && task.errorMessage && (
          <p
            className="mt-1 line-clamp-2 min-w-0 break-all text-xs leading-snug text-destructive"
            title={task.errorMessage}
          >
            {task.errorMessage}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
        {errored && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 hover:text-foreground"
            onClick={() => void handleRetry()}
            aria-label={t("common.retry")}
            title={t("common.retry")}
          >
            <RotateCcw className="size-4" />
          </Button>
        )}
        {(running || paused) && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 hover:text-foreground"
            onClick={() => void handleToggle()}
            aria-label={running ? t("common.pause") : t("common.start")}
            title={running ? t("common.pause") : t("common.start")}
          >
            {running ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 hover:text-foreground"
          onClick={() => void revealTask(task).catch(toastError)}
          aria-label={t("common.reveal")}
          title={t("common.reveal")}
        >
          <FolderOpen className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 hover:text-foreground"
              aria-label={t("common.more")}
            >
              <EllipsisVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onClick={() => onInspect(task)}>
              <Info className="size-4" /> {t("task.detail")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleCopy()}>
              <Copy className="size-4" /> {t("common.copy")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void revealTask(task).catch(toastError)}
            >
              <FolderOpen className="size-4" /> {t("common.reveal")}
            </DropdownMenuItem>
            {errored && (
              <DropdownMenuItem onClick={() => void handleRetry()}>
                <RotateCcw className="size-4" /> {t("common.retry")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onRemove(task)}
            >
              <Trash2 className="size-4" /> {t("task.remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
