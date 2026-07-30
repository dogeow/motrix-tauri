import { taskName } from "@/lib/format";
import type { Aria2Task, Category, GlobalStat } from "@/lib/types";

export type SortKey = "added" | "name" | "size" | "progress" | "speed";

export const SORT_KEYS: readonly SortKey[] = [
  "added",
  "name",
  "size",
  "progress",
  "speed",
];

export const CATEGORY_TABS: readonly Category[] = [
  "all",
  "active",
  "waiting",
  "stopped",
];

export function categoryTaskCount(
  stat: GlobalStat,
  category: Category
): number {
  switch (category) {
    case "all":
      return (
        Number(stat.numActive) +
        Number(stat.numWaiting) +
        Number(stat.numStopped)
      );
    case "active":
      return Number(stat.numActive);
    case "waiting":
      return Number(stat.numWaiting);
    case "stopped":
      return Number(stat.numStopped);
  }
}

export function sortTasks(
  tasks: readonly Aria2Task[],
  key: SortKey
): Aria2Task[] {
  const sorted = [...tasks];
  switch (key) {
    case "added":
      return sorted;
    case "name":
      return sorted.sort((a, b) =>
        taskName(a).localeCompare(taskName(b), "zh")
      );
    case "size":
      return sorted.sort(
        (a, b) => Number(b.totalLength) - Number(a.totalLength)
      );
    case "speed":
      return sorted.sort(
        (a, b) => Number(b.downloadSpeed) - Number(a.downloadSpeed)
      );
    case "progress":
      return sorted.sort((a, b) => progress(b) - progress(a));
  }
}

export function filterAndSortTasks(
  tasks: readonly Aria2Task[],
  query: string,
  sortKey: SortKey
): Aria2Task[] {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? tasks.filter((task) => taskName(task).toLowerCase().includes(needle))
    : tasks;
  return sortTasks(filtered, sortKey);
}

function progress(task: Aria2Task): number {
  const total = Number(task.totalLength);
  return total > 0 ? Number(task.completedLength) / total : 0;
}
