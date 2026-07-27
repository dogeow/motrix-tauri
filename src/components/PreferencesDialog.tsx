import { useEffect, useState } from "react";
import { ClipboardCopy, FolderOpen, RefreshCw, RotateCcw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pickDirectory, toastError, updateTrackers } from "@/lib/actions";
import { checkForUpdate } from "@/lib/updater";
import { LOCALE_NAMES, t, useTranslation, type LocaleSetting } from "@/lib/i18n";
import { useAppStore } from "@/store/app";
import {
  normalizeSpeedLimit,
  useSettingsStore,
  type ThemeMode,
} from "@/store/settings";

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Injected by Vite from package.json at build time. */
const APP_VERSION = __APP_VERSION__;

/** Rows share one label/control grid so every tab lines up. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** aria2 speed limits are strings like "0", "512K", "2M". */
function SpeedInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(normalizeSpeedLimit(draft))}
      className="w-28 text-right font-mono text-xs"
      placeholder="0"
    />
  );
}

function NumberInput({
  value,
  min,
  max,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <Input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const parsed = Number(draft);
        onCommit(
          Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value
        );
      }}
      className="w-28 text-right"
    />
  );
}

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

  // The OS is the source of truth for autostart, not our store. Read the
  // store lazily so this only ever re-runs when the dialog opens.
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

  const set = <K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K]
  ) => {
    void update({ [key]: value } as never).catch(toastError);
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

  const handlePickDir = async () => {
    try {
      const dir = await pickDirectory(
        settings.downloadDir || engine?.downloadDir
      );
      if (dir) set("downloadDir", dir);
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

          <TabsContent value="download" className="mt-2 divide-y">
            <Row label={t("prefs.dir")}>
              <div className="flex items-center gap-2">
                <span
                  className="max-w-52 truncate font-mono text-xs text-muted-foreground"
                  title={settings.downloadDir || engine?.downloadDir}
                >
                  {settings.downloadDir || engine?.downloadDir || "—"}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void handlePickDir()}
                  aria-label={t("common.chooseDir")}
                >
                  <FolderOpen className="size-4" />
                </Button>
              </div>
            </Row>
            <Row label={t("prefs.concurrent")} hint={t("prefs.applyNow")}>
              <NumberInput
                value={settings.maxConcurrentDownloads}
                min={1}
                max={50}
                onCommit={(value) => set("maxConcurrentDownloads", value)}
              />
            </Row>
            <Row label={t("prefs.connections")} hint={t("prefs.applyNew")}>
              <NumberInput
                value={settings.maxConnectionPerServer}
                min={1}
                max={64}
                onCommit={(value) => set("maxConnectionPerServer", value)}
              />
            </Row>
            <Row label={t("prefs.split")} hint={t("prefs.applyNew")}>
              <NumberInput
                value={settings.split}
                min={1}
                max={64}
                onCommit={(value) => set("split", value)}
              />
            </Row>
            <Row label={t("prefs.downLimit")} hint={t("prefs.downLimitHint")}>
              <SpeedInput
                value={settings.maxOverallDownloadLimit}
                onCommit={(value) => set("maxOverallDownloadLimit", value)}
              />
            </Row>
            <Row label={t("prefs.upLimit")} hint={t("prefs.upLimitHint")}>
              <SpeedInput
                value={settings.maxOverallUploadLimit}
                onCommit={(value) => set("maxOverallUploadLimit", value)}
              />
            </Row>
          </TabsContent>

          <TabsContent value="bt" className="mt-2 divide-y">
            <Row label={t("prefs.seedRatio")} hint={t("prefs.seedRatioHint")}>
              <NumberInput
                value={settings.seedRatio}
                min={0}
                max={100}
                onCommit={(value) => set("seedRatio", value)}
              />
            </Row>
            <Row
              label={t("prefs.trackers")}
              hint={
                trackerCount > 0
                  ? t("prefs.trackersCached", { count: trackerCount })
                  : t("prefs.trackersEmpty")
              }
            >
              <Button
                variant="outline"
                size="sm"
                disabled={updatingTrackers}
                onClick={() => void handleUpdateTrackers()}
              >
                <RefreshCw
                  className={`size-4 ${updatingTrackers ? "animate-spin" : ""}`}
                />
                {t("prefs.trackersUpdate")}
              </Button>
            </Row>
            <Row label={t("prefs.trackersAuto")}>
              <Switch
                checked={settings.autoUpdateTrackers}
                onCheckedChange={(checked) =>
                  set("autoUpdateTrackers", checked)
                }
              />
            </Row>
          </TabsContent>

          <TabsContent value="network" className="mt-2 divide-y">
            <Row label={t("prefs.btPort")} hint={t("prefs.btPortHint")}>
              <NumberInput
                value={settings.btPort}
                min={1024}
                max={65535}
                onCommit={(value) => set("btPort", value)}
              />
            </Row>
            <Row
              label={t("prefs.upnp")}
              hint={t("prefs.upnpHint")}
            >
              <Switch
                checked={settings.upnp}
                onCheckedChange={(checked) => set("upnp", checked)}
              />
            </Row>
            <Row
              label={t("prefs.rpcPort")}
              hint={t("prefs.rpcPortHint")}
            >
              <NumberInput
                value={settings.rpcPort}
                min={0}
                max={65535}
                onCommit={(value) => set("rpcPort", value)}
              />
            </Row>
            {engine && (
              <Row label={t("prefs.rpcAddress")} hint={t("prefs.rpcAddressHint")}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopyRpc()}
                >
                  <ClipboardCopy className="size-4" />
                  127.0.0.1:{engine.rpcPort}
                </Button>
              </Row>
            )}
            <Row label={t("prefs.restartEngine")} hint={t("prefs.restartEngineHint")}>
              <Button
                variant="outline"
                size="sm"
                disabled={restarting}
                onClick={() => void handleRestartEngine()}
              >
                <RotateCcw
                  className={`size-4 ${restarting ? "animate-spin" : ""}`}
                />
                {t("prefs.restartNow")}
              </Button>
            </Row>
          </TabsContent>

          <TabsContent value="app" className="mt-2 divide-y">
            <Row label={t("prefs.autostart")}>
              <Switch
                checked={settings.autostart}
                onCheckedChange={(checked) => void handleAutostart(checked)}
              />
            </Row>
            <Row label={t("prefs.notify")}>
              <Switch
                checked={settings.notifyOnComplete}
                onCheckedChange={(checked) => set("notifyOnComplete", checked)}
              />
            </Row>
            <Row label={t("prefs.clipboard")} hint={t("prefs.clipboardHint")}>
              <Switch
                checked={settings.watchClipboard}
                onCheckedChange={(checked) => set("watchClipboard", checked)}
              />
            </Row>
            <Row label={t("prefs.theme")}>
              <Select
                value={settings.theme}
                onValueChange={(value) => set("theme", value as ThemeMode)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">{t("prefs.themeSystem")}</SelectItem>
                  <SelectItem value="light">{t("prefs.themeLight")}</SelectItem>
                  <SelectItem value="dark">{t("prefs.themeDark")}</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label={t("prefs.language")}>
              <Select
                value={settings.language}
                onValueChange={(value) =>
                  set("language", value as LocaleSetting)
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">
                    {t("prefs.languageSystem")}
                  </SelectItem>
                  {Object.entries(LOCALE_NAMES).map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row
              label={t("prefs.checkUpdate")}
              hint={t("prefs.checkUpdateHint", { version: APP_VERSION })}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={checkingUpdate}
                onClick={() => void handleCheckUpdate()}
              >
                <RefreshCw
                  className={`size-4 ${checkingUpdate ? "animate-spin" : ""}`}
                />
                {t("prefs.checkNow")}
              </Button>
            </Row>
          </TabsContent>
        </Tabs>

        <Separator />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t("common.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
