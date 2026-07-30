import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AddTaskDialog } from "@/components/AddTaskDialog";
import { PreferencesDialog } from "@/components/PreferencesDialog";
import { RemoveTaskDialog } from "@/components/RemoveTaskDialog";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { AppToolbar } from "@/components/app/AppToolbar";
import { SelectionToolbar } from "@/components/app/SelectionToolbar";
import { StatusBar } from "@/components/app/StatusBar";
import { TaskList } from "@/components/app/TaskList";
import { Toaster } from "@/components/ui/sonner";
import { useAppLifecycle } from "@/hooks/useAppLifecycle";
import { useTaskSelection } from "@/hooks/useTaskSelection";
import { useTheme } from "@/hooks/useTheme";
import {
  batch,
  pauseAll,
  pauseTask,
  purgeStopped,
  resumeAll,
  resumeTask,
  toastError,
} from "@/lib/actions";
import { t, useTranslation } from "@/lib/i18n";
import { filterAndSortTasks, type SortKey } from "@/lib/task-list";
import type { Aria2Task } from "@/lib/types";
import { useAppStore } from "@/store/app";

export default function App() {
  const resolvedTheme = useTheme();
  useAppLifecycle();
  // Subscribing re-renders every label when the locale changes.
  useTranslation();

  const connected = useAppStore((state) => state.connected);
  const category = useAppStore((state) => state.category);
  const tasks = useAppStore((state) => state.tasks);
  const stat = useAppStore((state) => state.stat);
  const initError = useAppStore((state) => state.initError);
  const setCategory = useAppStore((state) => state.setCategory);

  const [addOpen, setAddOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Aria2Task | null>(null);
  const [inspectTarget, setInspectTarget] = useState<Aria2Task | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("added");

  const visibleTasks = useMemo(
    () => filterAndSortTasks(tasks, query, sortKey),
    [query, sortKey, tasks]
  );
  const {
    selectedGids,
    selectedTasks,
    setTaskSelected,
    clearSelection,
  } = useTaskSelection(tasks, visibleTasks);

  const runBatch = async (
    label: string,
    action: (task: Aria2Task) => Promise<unknown>
  ) => {
    const { done, failed } = await batch(selectedTasks, action);
    clearSelection();
    if (failed > 0) {
      toast.warning(t("selection.batchPartial", { action: label, done, failed }));
    } else {
      toast.success(t("selection.batchDone", { action: label, count: done }));
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppToolbar
        category={category}
        stat={stat}
        query={query}
        sortKey={sortKey}
        onCategoryChange={setCategory}
        onQueryChange={setQuery}
        onSortChange={setSortKey}
        onPurgeStopped={() => void purgeStopped().catch(toastError)}
        onPauseAll={() => void pauseAll().catch(toastError)}
        onResumeAll={() => void resumeAll().catch(toastError)}
        onOpenPreferences={() => setPrefsOpen(true)}
        onAddTask={() => setAddOpen(true)}
      />

      <SelectionToolbar
        count={selectedTasks.length}
        onStart={() =>
          void runBatch(t("common.start"), resumeTask).catch(toastError)
        }
        onPause={() =>
          void runBatch(t("common.pause"), pauseTask).catch(toastError)
        }
        onRemove={() => setRemoveTarget(selectedTasks[0] ?? null)}
        onClear={clearSelection}
      />

      <TaskList
        tasks={visibleTasks}
        category={category}
        query={query}
        initError={initError}
        selectedGids={selectedGids}
        onSelectedChange={setTaskSelected}
        onRemove={setRemoveTarget}
        onInspect={setInspectTarget}
      />

      <StatusBar connected={connected} stat={stat} />

      <AddTaskDialog open={addOpen} onOpenChange={setAddOpen} />
      <PreferencesDialog open={prefsOpen} onOpenChange={setPrefsOpen} />
      <RemoveTaskDialog
        task={removeTarget}
        extraTasks={
          removeTarget && selectedGids.has(removeTarget.gid)
            ? selectedTasks.filter((task) => task.gid !== removeTarget.gid)
            : []
        }
        onClose={() => {
          setRemoveTarget(null);
          clearSelection();
        }}
      />
      <TaskDetailDialog
        task={inspectTarget}
        onClose={() => setInspectTarget(null)}
      />
      <Toaster theme={resolvedTheme} position="bottom-right" />
    </div>
  );
}
