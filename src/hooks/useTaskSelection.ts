import { useCallback, useEffect, useMemo, useState } from "react";
import type { Aria2Task } from "@/lib/types";

export function useTaskSelection(
  tasks: readonly Aria2Task[],
  visibleTasks: readonly Aria2Task[]
) {
  const [selectedGids, setSelectedGids] = useState<Set<string>>(new Set());

  // Drop selections whose task disappeared.
  useEffect(() => {
    setSelectedGids((current) => {
      if (current.size === 0) return current;
      const alive = new Set(tasks.map((task) => task.gid));
      const next = new Set([...current].filter((gid) => alive.has(gid)));
      return next.size === current.size ? current : next;
    });
  }, [tasks]);

  const selectedTasks = useMemo(
    () => visibleTasks.filter((task) => selectedGids.has(task.gid)),
    [selectedGids, visibleTasks]
  );

  const setTaskSelected = useCallback(
    (task: Aria2Task, isSelected: boolean) => {
      setSelectedGids((current) => {
        const next = new Set(current);
        if (isSelected) next.add(task.gid);
        else next.delete(task.gid);
        return next;
      });
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedGids(new Set());
  }, []);

  return {
    selectedGids,
    selectedTasks,
    setTaskSelected,
    clearSelection,
  };
}
