import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";
import { t } from "./i18n";

/**
 * Download and install an update, then relaunch. Progress is reported into a
 * single sticky toast so it never stacks with the polling refresh toasts.
 */
export async function installUpdate(update: Update): Promise<void> {
  let downloaded = 0;
  let total = 0;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        toast.loading(t("update.downloading"), { id: "update" });
        break;
      case "Progress": {
        downloaded += event.data.chunkLength;
        const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        toast.loading(`${t("update.downloading")} ${percent}%`, {
          id: "update",
        });
        break;
      }
      case "Finished":
        toast.success(t("update.installing"), { id: "update" });
        break;
    }
  });

  await relaunch();
}

/**
 * @param silent when true, stay quiet unless an update is actually available
 * (used for the automatic check on launch).
 */
export async function checkForUpdate(silent = false): Promise<Update | null> {
  let update: Update | null = null;
  try {
    update = await check();
  } catch (error) {
    if (!silent) {
      toast.error(
        `${t("update.checkFailed")}${error instanceof Error ? `: ${error.message}` : ""}`
      );
    }
    return null;
  }

  if (!update) {
    if (!silent) toast.success(t("update.upToDate"));
    return null;
  }

  toast(t("update.available", { version: update.version }), {
    id: "update",
    duration: Infinity,
    action: {
      label: t("update.installNow"),
      onClick: () => {
        void installUpdate(update).catch((error) => {
          toast.error(
            `${t("update.failed")}${error instanceof Error ? `: ${error.message}` : ""}`,
            { id: "update" }
          );
        });
      },
    },
  });
  return update;
}
