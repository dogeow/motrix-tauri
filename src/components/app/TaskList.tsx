import { CircleAlert, Inbox, RotateCcw } from "lucide-react";
import { TaskItem } from "@/components/TaskItem";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { t } from "@/lib/i18n";
import type { Aria2Task, Category } from "@/lib/types";

interface TaskListProps {
  tasks: readonly Aria2Task[];
  category: Category;
  query: string;
  initError: string | null;
  selectedGids: ReadonlySet<string>;
  onSelectedChange: (task: Aria2Task, selected: boolean) => void;
  onRemove: (task: Aria2Task) => void;
  onInspect: (task: Aria2Task) => void;
}

export function TaskList({
  tasks,
  category,
  query,
  initError,
  selectedGids,
  onSelectedChange,
  onRemove,
  onInspect,
}: TaskListProps) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      {initError ? (
        <EmptyState
          icon={<CircleAlert className="size-6 text-destructive" />}
          title={t("engine.startFailed")}
          detail={initError}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              <RotateCcw className="size-4" /> {t("engine.reconnect")}
            </Button>
          }
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-6" />}
          title={query ? t("empty.noMatch") : t(`empty.${category}`)}
          detail={
            !query && (category === "all" || category === "active")
              ? t("empty.hint")
              : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-1.5 p-3">
          {tasks.map((task) => (
            <TaskItem
              key={task.gid}
              task={task}
              selected={selectedGids.has(task.gid)}
              onSelectedChange={onSelectedChange}
              onRemove={onRemove}
              onInspect={onInspect}
            />
          ))}
        </div>
      )}
    </ScrollArea>
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
