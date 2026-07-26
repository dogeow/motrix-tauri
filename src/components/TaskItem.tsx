import { Fragment, type ReactNode } from "react";
import {
  CircleCheck,
  Copy,
  Download,
  EllipsisVertical,
  FolderOpen,
  Magnet,
  Pause,
  Play,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { Aria2Task } from "@/lib/types";

interface TaskItemProps {
  task: Aria2Task;
  onRemove: (task: Aria2Task) => void;
}

export function TaskItem({ task, onRemove }: TaskItemProps) {
  const name = taskName(task);
  const progress = taskProgress(task);
  const isBt = Boolean(task.bittorrent);
  const running = task.status === "active";
  const paused = task.status === "paused";
  const complete = task.status === "complete";
  const errored = task.status === "error";
  const total = Number(task.totalLength);
  const seeding = running && isBt && total > 0 && task.completedLength === task.totalLength;

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
      if (copied) toast.success("链接已复制");
      else toast.info("该任务没有可复制的链接");
    } catch (error) {
      toastError(error);
    }
  };

  const meta: ReactNode[] = [];
  if (complete) {
    meta.push(formatBytes(task.totalLength));
  } else {
    meta.push(
      `${formatBytes(task.completedLength)} / ${formatBytes(task.totalLength)}`
    );
    if (total > 0) meta.push(`${progress.toFixed(1)}%`);
  }
  if (running) {
    meta.push(`↓ ${formatSpeed(task.downloadSpeed)}`);
    if (isBt && Number(task.uploadSpeed) > 0) {
      meta.push(`↑ ${formatSpeed(task.uploadSpeed)}`);
    }
    if (!seeding) meta.push(`剩余 ${formatEta(task)}`);
    if (isBt) meta.push(`${task.numSeeders ?? 0}/${task.connections} 连接`);
  }

  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/50">
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
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

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium" title={name}>
            {name}
          </span>
          {seeding && (
            <Badge variant="secondary" className="shrink-0">
              做种中
            </Badge>
          )}
          {paused && (
            <Badge variant="outline" className="shrink-0">
              已暂停
            </Badge>
          )}
        </div>

        {!complete && !errored && (
          <Progress value={progress} className="mt-2 h-1" />
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground tabular-nums">
          {meta.map((item, index) => (
            <Fragment key={index}>
              {index > 0 && <span className="opacity-40">·</span>}
              <span>{item}</span>
            </Fragment>
          ))}
          {errored && task.errorMessage && (
            <span className="truncate text-destructive" title={task.errorMessage}>
              {task.errorMessage}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
        {(running || paused) && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 hover:text-foreground"
            onClick={handleToggle}
            aria-label={running ? "暂停" : "开始"}
            title={running ? "暂停" : "开始"}
          >
            {running ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 hover:text-foreground"
          onClick={() => void revealTask(task).catch(toastError)}
          aria-label="打开所在文件夹"
          title="打开所在文件夹"
        >
          <FolderOpen className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 hover:text-foreground"
              aria-label="更多操作"
            >
              <EllipsisVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void handleCopy()}>
              <Copy className="size-4" /> 复制链接
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void revealTask(task).catch(toastError)}
            >
              <FolderOpen className="size-4" /> 打开所在文件夹
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onRemove(task)}
            >
              <Trash2 className="size-4" /> 删除任务
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
