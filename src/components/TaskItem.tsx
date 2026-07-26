import {
  ArrowDown,
  ArrowUp,
  Clock,
  Copy,
  EllipsisVertical,
  FolderOpen,
  Link2,
  Pause,
  Play,
  Trash2,
  Users,
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
import type { Aria2Task, TaskStatus } from "@/lib/types";

const STATUS_LABEL: Record<TaskStatus, string> = {
  active: "下载中",
  waiting: "等待中",
  paused: "已暂停",
  error: "出错",
  complete: "已完成",
  removed: "已移除",
};

function StatusBadge({ task }: { task: Aria2Task }) {
  const { status } = task;
  const isSeeding =
    status === "active" &&
    task.bittorrent &&
    Number(task.completedLength) > 0 &&
    task.completedLength === task.totalLength;

  if (isSeeding) return <Badge variant="secondary">做种中</Badge>;
  if (status === "error") {
    return <Badge variant="destructive">{STATUS_LABEL[status]}</Badge>;
  }
  if (status === "complete") {
    return <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>;
  }
  return <Badge variant="outline">{STATUS_LABEL[status]}</Badge>;
}

interface TaskItemProps {
  task: Aria2Task;
  onRemove: (task: Aria2Task) => void;
}

export function TaskItem({ task, onRemove }: TaskItemProps) {
  const name = taskName(task);
  const progress = taskProgress(task);
  const running = task.status === "active";
  const paused = task.status === "paused";
  const isBt = Boolean(task.bittorrent);

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

  return (
    <div className="group rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/40">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium" title={name}>
              {name}
            </span>
            <StatusBadge task={task} />
          </div>

          <div className="mt-2">
            <Progress value={progress} className="h-1.5" />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              {formatBytes(task.completedLength)} /{" "}
              {formatBytes(task.totalLength)}（{progress.toFixed(1)}%）
            </span>
            {running && (
              <span className="flex items-center gap-1">
                <ArrowDown className="size-3" />
                {formatSpeed(task.downloadSpeed)}
              </span>
            )}
            {running && isBt && (
              <span className="flex items-center gap-1">
                <ArrowUp className="size-3" />
                {formatSpeed(task.uploadSpeed)}
              </span>
            )}
            {running && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatEta(task)}
              </span>
            )}
            {running && isBt && (
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {task.numSeeders ?? 0}/{task.connections}
              </span>
            )}
            {task.status === "error" && task.errorMessage && (
              <span
                className="truncate text-destructive"
                title={task.errorMessage}
              >
                {task.errorMessage}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {(running || paused) && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={handleToggle}
              title={running ? "暂停" : "开始"}
            >
              {running ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void revealTask(task).catch(toastError)}
            title="打开所在文件夹"
          >
            <FolderOpen className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void handleCopy()}>
                <Copy className="size-4" /> 复制链接
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void revealTask(task).catch(toastError)}>
                <Link2 className="size-4" /> 打开所在文件夹
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
    </div>
  );
}
