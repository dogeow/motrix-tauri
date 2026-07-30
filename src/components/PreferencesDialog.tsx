import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { AppPreferences } from "@/components/preferences/AppPreferences";
import { BtPreferences } from "@/components/preferences/BtPreferences";
import { DownloadPreferences } from "@/components/preferences/DownloadPreferences";
import { NetworkPreferences } from "@/components/preferences/NetworkPreferences";
import type { UpdateSetting } from "@/components/preferences/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pickDirectory, toastError, updateTrackers } from "@/lib/actions";
import { t, useTranslation } from "@/lib/i18n";
import { checkForUpdate } from "@/lib/updater";
import { useAppStore } from "@/store/app";
import { useSettingsStore } from "@/store/settings";

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Injected by Vite from package.json at build time. */
const APP_VERSION = __APP_VERSION__;

export function PreferencesDialog({
  open,
  onOpenChange,
}: PreferencesDialogProps) {
  const { settings, trackers, update, load } = useSettingsStore();
  const engine = useAppStore((state) => state.engine);
  // Subscribing re-renders every label when the locale changes.
  useTranslation();
  const [updatingTrackers, setUpdatingTrackers] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // The OS is the source of truth for autostart, not our store.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void isAutostartEnabled()
      .then((enabled) => {
        if (cancelled) return;
        const state = useSettingsStore.getState();
        if (enabled !== state.settings.autostart) {
          void state.update({ autostart: enabled });
        }
      })
      .catch(() => {
        // Unsupported in this environment; leave the stored value alone.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const setSetting: UpdateSetting = (key, value) => {
    void update({ [key]: value }).catch(toastError);
  };

  const handleAutostart = async (enabled: boolean) => {
    try {
      if (enabled) await enableAutostart();
      else await disableAutostart();
      await update({ autostart: enabled });
    } catch (error) {
      toastError(error);
    }
  };

  const handlePickDirectory = async () => {
    try {
      const directory = await pickDirectory(
        settings.downloadDir || engine?.downloadDir
      );
      if (directory) setSetting("downloadDir", directory);
    } catch (error) {
      toastError(error);
    }
  };

  const handleUpdateTrackers = async () => {
    setUpdatingTrackers(true);
    try {
      const count = await updateTrackers();
      toast.success(t("prefs.trackersUpdated", { count }));
    } catch (error) {
      toastError(error);
    } finally {
      setUpdatingTrackers(false);
    }
  };

  const handleCopyRpc = async () => {
    if (!engine) return;
    try {
      await writeText(
        `http://127.0.0.1:${engine.rpcPort}/jsonrpc\n${engine.rpcSecret}`
      );
      toast.success(t("prefs.rpcCopied"));
    } catch (error) {
      toastError(error);
    }
  };

  const handleRestartEngine = async () => {
    setRestarting(true);
    try {
      await invoke("restart_engine");
      toast.success(t("engine.restarted"));
    } catch (error) {
      toastError(error);
    } finally {
      setRestarting(false);
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      await checkForUpdate();
    } finally {
      setCheckingUpdate(false);
    }
  };

  const trackerCount = trackers ? trackers.split(",").filter(Boolean).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("prefs.title")}</DialogTitle>
          <DialogDescription>{t("prefs.description")}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="download">
          <TabsList className="w-full">
            <TabsTrigger value="download" className="flex-1">
              {t("prefs.tabDownload")}
            </TabsTrigger>
            <TabsTrigger value="bt" className="flex-1">
              {t("prefs.tabBt")}
            </TabsTrigger>
            <TabsTrigger value="network" className="flex-1">
              {t("prefs.tabNetwork")}
            </TabsTrigger>
            <TabsTrigger value="app" className="flex-1">
              {t("prefs.tabApp")}
            </TabsTrigger>
          </TabsList>

          <DownloadPreferences
            settings={settings}
            engine={engine}
            setSetting={setSetting}
            onPickDirectory={() => void handlePickDirectory()}
          />
          <BtPreferences
            settings={settings}
            trackerCount={trackerCount}
            updatingTrackers={updatingTrackers}
            setSetting={setSetting}
            onUpdateTrackers={() => void handleUpdateTrackers()}
          />
          <NetworkPreferences
            settings={settings}
            engine={engine}
            restarting={restarting}
            setSetting={setSetting}
            onCopyRpc={() => void handleCopyRpc()}
            onRestartEngine={() => void handleRestartEngine()}
          />
          <AppPreferences
            settings={settings}
            appVersion={APP_VERSION}
            checkingUpdate={checkingUpdate}
            setSetting={setSetting}
            onAutostartChange={(enabled) => void handleAutostart(enabled)}
            onCheckUpdate={() => void handleCheckUpdate()}
          />
        </Tabs>

        <Separator />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t("common.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
