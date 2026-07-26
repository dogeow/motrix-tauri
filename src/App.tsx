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
import { useAppStore, type Category } from "@/store/app";

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
  waiting: "没有等待中的任务",
  stopped: "没有已停止的任务",
};

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
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-base font-semibold">Motrix</h1>
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void pauseAll().catch(toastError)}
              >
                <Pause className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>全部暂停</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void resumeAll().catch(toastError)}
              >
                <Play className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>全部开始</TooltipContent>
          </Tooltip>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> 新建任务
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 pt-3">
        <div className="flex items-center justify-between">
          <Tabs
            value={category}
            onValueChange={(value) => setCategory(value as Category)}
          >
            <TabsList>
              <TabsTrigger value="active">
                下载中{stat ? `（${stat.numActive}）` : ""}
              </TabsTrigger>
              <TabsTrigger value="waiting">
                等待中{stat ? `（${stat.numWaiting}）` : ""}
              </TabsTrigger>
              <TabsTrigger value="stopped">
                已停止{stat ? `（${stat.numStopped}）` : ""}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {category === "stopped" && tasks.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void purgeStopped().catch(toastError)}
            >
              <Eraser className="size-4" /> 清除记录
            </Button>
          )}
        </div>

        <ScrollArea className="min-h-0 flex-1 py-3">
          {initError ? (
            <div className="flex flex-col items-center gap-2 py-24 text-sm text-muted-foreground">
              <CircleAlert className="size-8 text-destructive" />
              <p>下载引擎启动失败</p>
              <p className="max-w-md text-center text-xs">{initError}</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-24 text-sm text-muted-foreground">
              <Inbox className="size-8" />
              <p>{EMPTY_HINT[category]}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pb-2">
              {tasks.map((task) => (
                <TaskItem key={task.gid} task={task} onRemove={setRemoveTarget} />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <footer className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
        <span
          className={`size-2 rounded-full ${
            connected ? "bg-emerald-500" : "bg-red-500"
          }`}
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
