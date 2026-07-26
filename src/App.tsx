import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleAlert,
  Eraser,
  Inbox,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AddTaskDialog } from "@/components/AddTaskDialog";
import { PreferencesDialog } from "@/components/PreferencesDialog";
import { RemoveTaskDialog } from "@/components/RemoveTaskDialog";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { TaskItem } from "@/components/TaskItem";
import {
  batch,
  pauseAll,
  pauseTask,
  purgeStopped,
  resumeAll,
  resumeTask,
  toastError,
  updateTrackers,
} from "@/lib/actions";
import { formatSpeed, taskName } from "@/lib/format";
import { initIntegrations } from "@/lib/integrations";
import type { Aria2Task, GlobalStat } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore, type Category } from "@/store/app";
import { useSettingsStore } from "@/store/settings";

/** macOS keeps its traffic lights over our toolbar, so reserve space for them. */
const IS_MAC = navigator.userAgent.includes("Macintosh");

type SortKey = "added" | "name" | "size" | "progress" | "speed";

const SORT_LABEL: Record<SortKey, string> = {
  added: "添加顺序",
  name: "名称",
  size: "大小",
  progress: "进度",
  speed: "速度",
};

const EMPTY_HINT: Record<Category, string> = {
  all: "还没有任何任务",
  active: "没有正在下载的任务",
  waiting: "队列里没有等待中的任务",
  stopped: "没有已完成或已停止的任务",
};

const CATEGORY_TABS: {
  value: Category;
  label: string;
  count: (stat: GlobalStat) => number;
}[] = [
  {
    value: "all",
    label: "全部",
    count: (stat) =>
      Number(stat.numActive) + Number(stat.numWaiting) + Number(stat.numStopped),
  },
  { value: "active", label: "下载中", count: (stat) => Number(stat.numActive) },
  { value: "waiting", label: "等待中", count: (stat) => Number(stat.numWaiting) },
  { value: "stopped", label: "已停止", count: (stat) => Number(stat.numStopped) },
];

/** Follows the OS unless the user pinned a theme in preferences. */
function useTheme() {
  const theme = useSettingsStore((state) => state.settings.theme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "system" ? media.matches : theme === "dark";
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

function sortTasks(tasks: Aria2Task[], key: SortKey): Aria2Task[] {
  if (key === "added") return tasks;
  const sorted = [...tasks];
  switch (key) {
    case "name":
      return sorted.sort((a, b) => taskName(a).localeCompare(taskName(b), "zh"));
    case "size":
      return sorted.sort((a, b) => Number(b.totalLength) - Number(a.totalLength));
    case "speed":
      return sorted.sort(
        (a, b) => Number(b.downloadSpeed) - Number(a.downloadSpeed)
      );
    case "progress":
      return sorted.sort((a, b) => {
        const ratio = (t: Aria2Task) =>
          Number(t.totalLength) > 0
            ? Number(t.completedLength) / Number(t.totalLength)
            : 0;
        return ratio(b) - ratio(a);
      });
  }
}

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
  useTheme();

  const { connected, category, tasks, stat, initError, init, setCategory } =
    useAppStore();
  const loadSettings = useSettingsStore((state) => state.load);
  const autoUpdateTrackers = useSettingsStore(
    (state) => state.settings.autoUpdateTrackers
  );

  const [addOpen, setAddOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Aria2Task | null>(null);
  const [inspectTarget, setInspectTarget] = useState<Aria2Task | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("added");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadSettings();
    void init();
  }, [init, loadSettings]);

  useEffect(() => {
    const cleanup = initIntegrations();
    return () => {
      void cleanup.then((teardown) => teardown());
    };
  }, []);

  // Refresh trackers once per launch, in the background.
  useEffect(() => {
    if (!connected || !autoUpdateTrackers) return;
    const timer = setTimeout(() => {
      void updateTrackers().catch(() => {
        // Offline or blocked; the bundled list stays in effect.
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [connected, autoUpdateTrackers]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? tasks.filter((task) => taskName(task).toLowerCase().includes(needle))
      : tasks;
    return sortTasks(filtered, sortKey);
  }, [tasks, query, sortKey]);

  // Drop selections whose task disappeared.
  useEffect(() => {
    setSelected((current) => {
      if (current.size === 0) return current;
      const alive = new Set(tasks.map((task) => task.gid));
      const next = new Set([...current].filter((gid) => alive.has(gid)));
      return next.size === current.size ? current : next;
    });
  }, [tasks]);

  const selectedTasks = useMemo(
    () => visible.filter((task) => selected.has(task.gid)),
    [visible, selected]
  );

  const handleSelectedChange = (task: Aria2Task, isSelected: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (isSelected) next.add(task.gid);
      else next.delete(task.gid);
      return next;
    });
  };

  const runBatch = async (
    label: string,
    action: (task: Aria2Task) => Promise<unknown>
  ) => {
    const { done, failed } = await batch(selectedTasks, action);
    setSelected(new Set());
    if (failed > 0) toast.warning(`${label} ${done} 个，${failed} 个失败`);
    else toast.success(`已${label} ${done} 个任务`);
  };

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
            {CATEGORY_TABS.map(({ value, label, count }) => (
              <TabsTrigger key={value} value={value}>
                {label}
                {stat && count(stat) > 0 && (
                  <span className="ml-1 tabular-nums opacity-60">
                    {count(stat)}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative ml-auto w-44">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索任务"
            className="h-8 pl-8 text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="清除搜索"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-foreground"
                    aria-label="排序方式"
                  >
                    <ArrowUpDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>排序方式</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={sortKey === key}
                  onCheckedChange={() => setSortKey(key)}
                >
                  {SORT_LABEL[key]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {stat && Number(stat.numStopped) > 0 && (
            <IconAction
              label="清除已停止记录"
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
          <IconAction label="偏好设置" onClick={() => setPrefsOpen(true)}>
            <Settings className="size-4" />
          </IconAction>
          <Button size="sm" className="ml-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> 新建任务
          </Button>
        </div>
      </header>

      {selectedTasks.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-accent/40 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">
            已选中 {selectedTasks.length} 个任务
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void runBatch("开始", resumeTask).catch(toastError)}
            >
              <Play className="size-3.5" /> 开始
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void runBatch("暂停", pauseTask).catch(toastError)}
            >
              <Pause className="size-3.5" /> 暂停
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setRemoveTarget(selectedTasks[0])}
            >
              <Trash2 className="size-3.5" /> 删除
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              取消选择
            </Button>
          </div>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        {initError ? (
          <EmptyState
            icon={<CircleAlert className="size-6 text-destructive" />}
            title="下载引擎启动失败"
            detail={initError}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                <RotateCcw className="size-4" /> 重新连接
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-6" />}
            title={query ? "没有匹配的任务" : EMPTY_HINT[category]}
            detail={
              !query && (category === "all" || category === "active")
                ? "点击右上角「新建任务」，或把 .torrent 文件拖进窗口"
                : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-1.5 p-3">
            {visible.map((task) => (
              <TaskItem
                key={task.gid}
                task={task}
                selected={selected.has(task.gid)}
                onSelectedChange={handleSelectedChange}
                onRemove={setRemoveTarget}
                onInspect={setInspectTarget}
              />
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
      <PreferencesDialog open={prefsOpen} onOpenChange={setPrefsOpen} />
      <RemoveTaskDialog
        task={removeTarget}
        extraTasks={
          removeTarget && selected.has(removeTarget.gid)
            ? selectedTasks.filter((task) => task.gid !== removeTarget.gid)
            : []
        }
        onClose={() => {
          setRemoveTarget(null);
          setSelected(new Set());
        }}
      />
      <TaskDetailDialog
        task={inspectTarget}
        onClose={() => setInspectTarget(null)}
      />
      <Toaster position="bottom-right" />
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
  action?: React.ReactNode;
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
      {action}
    </div>
  );
}
