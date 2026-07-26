import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Eraser,
  Inbox,
  Pause,
  Play,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AddTaskDialog } from "@/components/AddTaskDialog";
import { RemoveTaskDialog } from "@/components/RemoveTaskDialog";
import { TaskItem } from "@/components/TaskItem";
import { pauseAll, purgeStopped, resumeAll, toastError } from "@/lib/actions";
import { formatSpeed } from "@/lib/format";
import type { Aria2Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore, type Category } from "@/store/app";

/** macOS keeps its traffic lights over our toolbar, so reserve space for them. */
const IS_MAC = navigator.userAgent.includes("Macintosh");

function useSystemTheme() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle("dark", media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
}

const EMPTY_HINT: Record<Category, string> = {
  active: "没有正在下载的任务",
  waiting: "队列里没有等待中的任务",
  stopped: "没有已完成或已停止的任务",
};

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function App() {
  useSystemTheme();

  const { connected, category, tasks, stat, initError, init, setCategory } =
    useAppStore();
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Aria2Task | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header
        data-tauri-drag-region
        className={cn(
          "flex h-13 shrink-0 items-center gap-3 border-b px-3",
          IS_MAC && "pl-20"
        )}
      >
        <Tabs
          value={category}
          onValueChange={(value) => setCategory(value as Category)}
        >
          <TabsList>
            <TabsTrigger value="active">
              下载中
              {stat && Number(stat.numActive) > 0 && (
                <span className="ml-1 tabular-nums opacity-60">
                  {stat.numActive}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="waiting">
              等待中
              {stat && Number(stat.numWaiting) > 0 && (
                <span className="ml-1 tabular-nums opacity-60">
                  {stat.numWaiting}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="stopped">
              已停止
              {stat && Number(stat.numStopped) > 0 && (
                <span className="ml-1 tabular-nums opacity-60">
                  {stat.numStopped}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-0.5">
          {category === "stopped" && tasks.length > 0 && (
            <IconAction
              label="清除记录"
              onClick={() => void purgeStopped().catch(toastError)}
            >
              <Eraser className="size-4" />
            </IconAction>
          )}
          <IconAction
            label="全部暂停"
            onClick={() => void pauseAll().catch(toastError)}
          >
            <Pause className="size-4" />
          </IconAction>
          <IconAction
            label="全部开始"
            onClick={() => void resumeAll().catch(toastError)}
          >
            <Play className="size-4" />
          </IconAction>
          <Button size="sm" className="ml-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> 新建任务
          </Button>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        {initError ? (
          <EmptyState
            icon={<CircleAlert className="size-6 text-destructive" />}
            title="下载引擎启动失败"
            detail={initError}
          />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-6" />}
            title={EMPTY_HINT[category]}
            detail={category === "active" ? "点击右上角「新建任务」开始下载" : undefined}
          />
        ) : (
          <div className="flex flex-col gap-1.5 p-3">
            {tasks.map((task) => (
              <TaskItem key={task.gid} task={task} onRemove={setRemoveTarget} />
            ))}
          </div>
        )}
      </ScrollArea>

      <footer className="flex h-8 shrink-0 items-center gap-2 border-t px-4 text-xs text-muted-foreground">
        <span
          className={cn(
            "size-1.5 rounded-full",
            connected ? "bg-emerald-500" : "bg-amber-500"
          )}
        />
        <span>{connected ? "引擎已连接" : "正在连接引擎…"}</span>
        {stat && (
          <span className="ml-auto flex items-center gap-3 tabular-nums">
            <span className="flex items-center gap-1">
              <ArrowDown className="size-3" />
              {formatSpeed(stat.downloadSpeed)}
            </span>
            <span className="flex items-center gap-1">
              <ArrowUp className="size-3" />
              {formatSpeed(stat.uploadSpeed)}
            </span>
          </span>
        )}
      </footer>

      <AddTaskDialog open={addOpen} onOpenChange={setAddOpen} />
      <RemoveTaskDialog
        task={removeTarget}
        onClose={() => setRemoveTarget(null)}
      />
      <Toaster position="bottom-right" />
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-28 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm text-muted-foreground">{title}</p>
      {detail && (
        <p className="max-w-md text-xs text-muted-foreground/70">{detail}</p>
      )}
    </div>
  );
}
