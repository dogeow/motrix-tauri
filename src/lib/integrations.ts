import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { toast } from "sonner";
import { addTargets, pauseAll, resumeAll, tellStatus, toastError } from "./actions";
import { formatSpeed, taskName } from "./format";
import { t } from "./i18n";
import { onAria2Notification, useAppStore } from "@/store/app";
import { useSettingsStore } from "@/store/settings";

const CLIPBOARD_INTERVAL = 1500;
const LINK_PATTERN = /^(magnet:\?|https?:\/\/|ftp:\/\/)\S+$/i;

type Cleanup = () => void;

async function handleTargets(targets: string[]): Promise<void> {
  if (targets.length === 0) return;
  try {
    const added = await addTargets(targets);
    if (added > 0) toast.success(t("add.added", { count: added }));
  } catch (error) {
    toastError(error);
  }
}

/** Deep links, file associations and second-instance launches. */
async function wireOpenTargets(): Promise<Cleanup> {
  const unlisten = await listen<string[]>("open-targets", (event) => {
    void handleTargets(event.payload);
  });
  // Anything that arrived before this listener existed.
  const pending = await invoke<string[]>("take_pending_targets");
  void handleTargets(pending);
  return unlisten;
}

async function wireTrayCommands(): Promise<Cleanup> {
  return listen<string>("tray-command", (event) => {
    const run = event.payload === "pause-all" ? pauseAll : resumeAll;
    void run().catch(toastError);
  });
}

async function wireEngineEvents(): Promise<Cleanup> {
  const down = await listen<string>("engine-down", (event) => {
    toast.error(t("engine.down", { reason: event.payload }), { id: "engine" });
  });
  const started = await listen("engine-started", () => {
    toast.success(t("engine.ready"), { id: "engine" });
    void useSettingsStore.getState().syncToEngine();
  });
  return () => {
    down();
    started();
  };
}

/** Dropping .torrent files or a link onto the window adds them. */
async function wireDragDrop(): Promise<Cleanup> {
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type !== "drop") return;
    const paths = event.payload.paths.filter((path) =>
      /\.torrent$/i.test(path)
    );
    if (paths.length === 0) {
      toast.info(t("add.dropOnlyTorrent"));
      return;
    }
    void handleTargets(paths);
  });
}

/** Offer to download a link the moment it lands on the clipboard. */
function wireClipboard(): Cleanup {
  let lastSeen = "";
  const timer = setInterval(async () => {
    if (!useSettingsStore.getState().settings.watchClipboard) return;
    let text: string;
    try {
      text = (await readText())?.trim() ?? "";
    } catch {
      return;
    }
    if (!text || text === lastSeen || !LINK_PATTERN.test(text)) return;
    lastSeen = text;

    const alreadyQueued = useAppStore
      .getState()
      .tasks.some((task) => task.files[0]?.uris[0]?.uri === text);
    if (alreadyQueued) return;

    toast(t("clipboard.found"), {
      description: text.length > 60 ? `${text.slice(0, 60)}…` : text,
      action: {
        label: t("clipboard.download"),
        onClick: () => void handleTargets([text]),
      },
    });
  }, CLIPBOARD_INTERVAL);

  return () => clearInterval(timer);
}

/** Notify once per finished download. */
function wireCompletionNotices(): Cleanup {
  let granted = false;
  void (async () => {
    granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
  })();

  const detach = onAria2Notification((method, gid) => {
    if (
      method !== "aria2.onDownloadComplete" &&
      method !== "aria2.onBtDownloadComplete"
    ) {
      return;
    }
    if (!useSettingsStore.getState().settings.notifyOnComplete) return;

    void tellStatus(gid)
      .then((task) => {
        const title = taskName(task);
        if (granted) {
          sendNotification({ title: t("notify.complete"), body: title });
        } else {
          toast.success(t("notify.completeBody", { name: title }));
        }
      })
      .catch(() => {
        // Task vanished between the notification and the status query.
      });
  });
  return detach;
}

/** Mirror aggregate speed onto the tray, and progress onto the Dock. */
function wireStatusIndicators(): Cleanup {
  let lastTitle = "";
  return useAppStore.subscribe((state) => {
    const active = state.tasks.filter((task) => task.status === "active");
    const title =
      state.stat && Number(state.stat.downloadSpeed) > 0
        ? `↓ ${formatSpeed(state.stat.downloadSpeed)}`
        : "";
    if (title !== lastTitle) {
      lastTitle = title;
      void invoke("set_tray_title", { title: title || null });
      void invoke("set_tray_tooltip", {
        tooltip: title ? `Motrix — ${title}` : "Motrix",
      });
    }

    const total = active.reduce((sum, task) => sum + Number(task.totalLength), 0);
    const done = active.reduce(
      (sum, task) => sum + Number(task.completedLength),
      0
    );
    void invoke("set_progress", {
      progress: total > 0 ? (done / total) * 100 : null,
    });
  });
}

/** Wire every OS-level integration; returns a single teardown. */
export async function initIntegrations(): Promise<Cleanup> {
  const cleanups = await Promise.all([
    wireOpenTargets(),
    wireTrayCommands(),
    wireEngineEvents(),
    wireDragDrop(),
    Promise.resolve(wireClipboard()),
    Promise.resolve(wireCompletionNotices()),
    Promise.resolve(wireStatusIndicators()),
  ]);
  return () => cleanups.forEach((cleanup) => cleanup());
}
