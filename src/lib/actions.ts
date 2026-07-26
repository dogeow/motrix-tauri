import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { aria2, useAppStore } from "@/store/app";
import { taskFilePath, taskName } from "./format";
import type { Aria2Task } from "./types";

function refresh(): void {
  void useAppStore.getState().refresh();
}

export interface AddUrisResult {
  added: number;
  failed: { uri: string; error: string }[];
}

export async function addUris(
  uris: string[],
  dir?: string
): Promise<AddUrisResult> {
  const options = dir ? { dir } : {};
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

export async function pickTorrentFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "种子文件", extensions: ["torrent"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function addTorrent(path: string, dir?: string): Promise<void> {
  const base64 = await invoke<string>("read_file_base64", { path });
  const options = dir ? { dir } : {};
  await aria2().call("addTorrent", base64, [], options);
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

export function toastError(error: unknown): void {
  toast.error(error instanceof Error ? error.message : String(error));
}

export function describeTask(task: Aria2Task): string {
  return taskName(task);
}
