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
import { useAppStore } from "@/store/app";
import { useSettingsStore, type ThemeMode } from "@/store/settings";

interface PreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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
      onBlur={() => onCommit(draft.trim() || "0")}
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
  const [updatingTrackers, setUpdatingTrackers] = useState(false);
  const [restarting, setRestarting] = useState(false);

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
      toast.success(`已更新 ${count} 个 tracker`);
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
        `http://127.0.0.1:${engine.rpcPort}/jsonrpc\n密钥: ${engine.rpcSecret}`
      );
      toast.success("RPC 地址和密钥已复制");
    } catch (error) {
      toastError(error);
    }
  };

  const handleRestartEngine = async () => {
    setRestarting(true);
    try {
      await invoke("restart_engine");
      toast.success("下载引擎已重启");
    } catch (error) {
      toastError(error);
    } finally {
      setRestarting(false);
    }
  };

  const trackerCount = trackers ? trackers.split(",").filter(Boolean).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>偏好设置</DialogTitle>
          <DialogDescription>
            并发与限速立即生效，其余选项应用于之后新建的任务
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="download">
          <TabsList className="w-full">
            <TabsTrigger value="download" className="flex-1">
              下载
            </TabsTrigger>
            <TabsTrigger value="bt" className="flex-1">
              BT
            </TabsTrigger>
            <TabsTrigger value="network" className="flex-1">
              网络
            </TabsTrigger>
            <TabsTrigger value="app" className="flex-1">
              应用
            </TabsTrigger>
          </TabsList>

          <TabsContent value="download" className="mt-2 divide-y">
            <Row label="默认下载目录">
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
                  aria-label="选择下载目录"
                >
                  <FolderOpen className="size-4" />
                </Button>
              </div>
            </Row>
            <Row label="最大同时下载数" hint="立即生效">
              <NumberInput
                value={settings.maxConcurrentDownloads}
                min={1}
                max={50}
                onCommit={(value) => set("maxConcurrentDownloads", value)}
              />
            </Row>
            <Row label="单服务器最大连接数" hint="应用于新任务">
              <NumberInput
                value={settings.maxConnectionPerServer}
                min={1}
                max={64}
                onCommit={(value) => set("maxConnectionPerServer", value)}
              />
            </Row>
            <Row label="单任务分片数" hint="应用于新任务">
              <NumberInput
                value={settings.split}
                min={1}
                max={64}
                onCommit={(value) => set("split", value)}
              />
            </Row>
            <Row label="全局下载限速" hint="0 表示不限速，可用 512K / 2M">
              <SpeedInput
                value={settings.maxOverallDownloadLimit}
                onCommit={(value) => set("maxOverallDownloadLimit", value)}
              />
            </Row>
            <Row label="全局上传限速" hint="0 表示不限速">
              <SpeedInput
                value={settings.maxOverallUploadLimit}
                onCommit={(value) => set("maxOverallUploadLimit", value)}
              />
            </Row>
          </TabsContent>

          <TabsContent value="bt" className="mt-2 divide-y">
            <Row label="做种比例" hint="达到后停止做种，0 表示一直做种">
              <NumberInput
                value={settings.seedRatio}
                min={0}
                max={100}
                onCommit={(value) => set("seedRatio", value)}
              />
            </Row>
            <Row
              label="Tracker 列表"
              hint={
                trackerCount > 0
                  ? `已缓存 ${trackerCount} 个，来自 ngosang/trackerslist`
                  : "尚未更新，正在使用内置列表"
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
                立即更新
              </Button>
            </Row>
            <Row label="启动时自动更新 Tracker">
              <Switch
                checked={settings.autoUpdateTrackers}
                onCheckedChange={(checked) =>
                  set("autoUpdateTrackers", checked)
                }
              />
            </Row>
          </TabsContent>

          <TabsContent value="network" className="mt-2 divide-y">
            <Row label="BT 监听端口" hint="改动后需重启引擎">
              <NumberInput
                value={settings.btPort}
                min={1024}
                max={65535}
                onCommit={(value) => set("btPort", value)}
              />
            </Row>
            <Row
              label="UPnP 端口映射"
              hint="让路由器把 BT 端口转发进来，提升连通性"
            >
              <Switch
                checked={settings.upnp}
                onCheckedChange={(checked) => set("upnp", checked)}
              />
            </Row>
            <Row
              label="固定 RPC 端口"
              hint="填 0 为随机端口（更安全）。固定后密钥也会持久化，供浏览器扩展连接"
            >
              <NumberInput
                value={settings.rpcPort}
                min={0}
                max={65535}
                onCommit={(value) => set("rpcPort", value)}
              />
            </Row>
            {engine && (
              <Row label="当前 RPC 地址" hint="点击复制，可填入 AriaNg 等客户端">
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
            <Row label="重启下载引擎" hint="应用端口相关改动">
              <Button
                variant="outline"
                size="sm"
                disabled={restarting}
                onClick={() => void handleRestartEngine()}
              >
                <RotateCcw
                  className={`size-4 ${restarting ? "animate-spin" : ""}`}
                />
                立即重启
              </Button>
            </Row>
          </TabsContent>

          <TabsContent value="app" className="mt-2 divide-y">
            <Row label="开机时启动">
              <Switch
                checked={settings.autostart}
                onCheckedChange={(checked) => void handleAutostart(checked)}
              />
            </Row>
            <Row label="下载完成时通知">
              <Switch
                checked={settings.notifyOnComplete}
                onCheckedChange={(checked) => set("notifyOnComplete", checked)}
              />
            </Row>
            <Row label="监听剪贴板链接" hint="复制链接后提示一键下载">
              <Switch
                checked={settings.watchClipboard}
                onCheckedChange={(checked) => set("watchClipboard", checked)}
              />
            </Row>
            <Row label="主题">
              <Select
                value={settings.theme}
                onValueChange={(value) => set("theme", value as ThemeMode)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">跟随系统</SelectItem>
                  <SelectItem value="light">浅色</SelectItem>
                  <SelectItem value="dark">深色</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </TabsContent>
        </Tabs>

        <Separator />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
