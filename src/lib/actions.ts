import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { aria2, useAppStore } from "@/store/app";
import { taskOptions, useSettingsStore } from "@/store/settings";
import { taskFilePath, taskName } from "./format";
import type {
  Aria2File,
  Aria2Options,
  Aria2Peer,
  Aria2ServerEntry,
  Aria2Task,
} from "./types";

function refresh(): void {
  void useAppStore.getState().refresh();
}

/** Per-task defaults from preferences, with an explicit dir taking priority. */
function newTaskOptions(dir?: string): Aria2Options {
  const { settings, trackers } = useSettingsStore.getState();
  const options = taskOptions(settings, trackers);
  if (dir) options.dir = dir;
  return options;
}

export interface AddUrisResult {
  added: number;
  failed: { uri: string; error: string }[];
}

export async function addUris(
  uris: string[],
  dir?: string
): Promise<AddUrisResult> {
  const options = newTaskOptions(dir);
  const failed: AddUrisResult["failed"] = [];
  let added = 0;
  for (const uri of uris) {
    try {
      await aria2().call("addUri", [uri], options);
      added += 1;
    } catch (error) {
      failed.push({
        uri,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  refresh();
  return { added, failed };
}

/** Route anything dropped/pasted/deep-linked to the right aria2 call. */
export async function addTargets(targets: string[]): Promise<number> {
  let added = 0;
  const uris: string[] = [];
  for (const target of targets) {
    if (/\.torrent$/i.test(target) && !/^[a-z]+:\/\//i.test(target)) {
      try {
        await addTorrent(target);
        added += 1;
      } catch (error) {
        toastError(error);
      }
    } else {
      uris.push(target);
    }
  }
  if (uris.length > 0) {
    const result = await addUris(uris);
    added += result.added;
    if (result.failed.length > 0) toast.error(result.failed[0].error);
  }
  return added;
}

export async function pickTorrentFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "种子文件", extensions: ["torrent"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function addTorrent(path: string, dir?: string): Promise<void> {
  const base64 = await invoke<string>("read_file_base64", { path });
  await aria2().call("addTorrent", base64, [], newTaskOptions(dir));
  refresh();
}

export async function pickDirectory(defaultPath?: string): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath,
  });
  return typeof selected === "string" ? selected : null;
}

export async function pauseTask(task: Aria2Task): Promise<void> {
  try {
    await aria2().call("pause", task.gid);
  } catch {
    await aria2().call("forcePause", task.gid);
  }
  refresh();
}

export async function resumeTask(task: Aria2Task): Promise<void> {
  await aria2().call("unpause", task.gid);
  refresh();
}

export async function pauseAll(): Promise<void> {
  await aria2().call("pauseAll");
  refresh();
}

export async function resumeAll(): Promise<void> {
  await aria2().call("unpauseAll");
  refresh();
}

export async function purgeStopped(): Promise<void> {
  await aria2().call("purgeDownloadResult");
  refresh();
}

const STOPPED: ReadonlySet<string> = new Set(["complete", "error", "removed"]);

export async function removeTask(
  task: Aria2Task,
  deleteFiles: boolean
): Promise<void> {
  if (STOPPED.has(task.status)) {
    await aria2().call("removeDownloadResult", task.gid);
  } else {
    try {
      await aria2().call("remove", task.gid);
    } catch {
      await aria2().call("forceRemove", task.gid);
    }
    // Drop the stopped record too so the task disappears entirely.
    try {
      await aria2().call("removeDownloadResult", task.gid);
    } catch {
      // aria2 moves the task to the stopped list asynchronously; retry once
      // shortly after so no ghost "removed" record lingers there.
      setTimeout(() => {
        void aria2()
          .call("removeDownloadResult", task.gid)
          .catch(() => {})
          .finally(refresh);
      }, 800);
    }
  }

  if (deleteFiles) {
    // Trash only the files aria2 registered for this task — never the
    // whole "<dir>/<torrent name>" directory, which may pre-date the
    // download and contain unrelated user files.
    const files = task.files
      .map((file) => file.path)
      .filter((path) => path && !path.startsWith("[METADATA]"));
    if (files.length > 0) {
      await invoke("trash_task_files", {
        files,
        baseDir: task.dir,
        controlRoot: taskFilePath(task),
      });
    }
  }
  refresh();
}

export async function revealTask(task: Aria2Task): Promise<void> {
  const path = taskFilePath(task);
  try {
    await invoke("reveal_in_folder", { path: path ?? task.dir });
  } catch {
    // File may not exist yet (e.g. metadata-only stage); fall back to the dir.
    await invoke("reveal_in_folder", { path: task.dir });
  }
}

export async function copyTaskLink(task: Aria2Task): Promise<boolean> {
  const uri = task.files[0]?.uris[0]?.uri;
  if (!uri) return false;
  await navigator.clipboard.writeText(uri);
  return true;
}

/** Re-queue a failed task from its original URI, dropping the dead record. */
export async function retryTask(task: Aria2Task): Promise<void> {
  const uri = task.files[0]?.uris[0]?.uri;
  if (!uri) throw new Error("该任务没有可重试的链接");
  await aria2().call("addUri", [uri], { ...newTaskOptions(), dir: task.dir });
  try {
    await aria2().call("removeDownloadResult", task.gid);
  } catch {
    // Record may already be gone.
  }
  refresh();
}

/** Run an action over many tasks, collecting failures instead of aborting. */
export async function batch(
  tasks: Aria2Task[],
  action: (task: Aria2Task) => Promise<unknown>
): Promise<{ done: number; failed: number }> {
  const results = await Promise.allSettled(tasks.map(action));
  refresh();
  return {
    done: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  };
}

export function tellStatus(gid: string): Promise<Aria2Task> {
  return aria2().call<Aria2Task>("tellStatus", gid);
}

export function getFiles(gid: string): Promise<Aria2File[]> {
  return aria2().call<Aria2File[]>("getFiles", gid);
}

export function getPeers(gid: string): Promise<Aria2Peer[]> {
  return aria2().call<Aria2Peer[]>("getPeers", gid);
}

export function getServers(gid: string): Promise<Aria2ServerEntry[]> {
  return aria2().call<Aria2ServerEntry[]>("getServers", gid);
}

/** aria2 wants 1-based file indexes, comma separated; empty means "all". */
export async function selectFiles(
  gid: string,
  indexes: string[]
): Promise<void> {
  await aria2().call("changeOption", gid, {
    "select-file": indexes.join(","),
  });
  refresh();
}

const TRACKER_SOURCE =
  "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt";

/**
 * Refresh the tracker list from ngosang/trackerslist and push it to running
 * BT tasks. Goes through the Rust HTTP client because the webview would be
 * blocked by CORS.
 */
export async function updateTrackers(): Promise<number> {
  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
  const response = await tauriFetch(TRACKER_SOURCE, { method: "GET" });
  if (!response.ok) throw new Error(`拉取 tracker 失败：HTTP ${response.status}`);

  const list = (await response.text())
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (list.length === 0) throw new Error("tracker 列表为空");

  const joined = list.join(",");
  await useSettingsStore.getState().setTrackers(joined);

  // Live BT tasks accept a new tracker list without a restart.
  const tasks = useAppStore.getState().tasks.filter((task) => task.bittorrent);
  await Promise.allSettled(
    tasks.map((task) =>
      aria2().call("changeOption", task.gid, { "bt-tracker": joined })
    )
  );
  return list.length;
}

export function toastError(error: unknown): void {
  toast.error(error instanceof Error ? error.message : String(error));
}

export function describeTask(task: Aria2Task): string {
  return taskName(task);
}
