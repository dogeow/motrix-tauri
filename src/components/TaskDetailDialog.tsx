import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getFiles,
  getPeers,
  getServers,
  selectFiles,
  toastError,
} from "@/lib/actions";
import { formatBytes, formatSpeed, taskName } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Aria2File, Aria2Peer, Aria2ServerEntry, Aria2Task } from "@/lib/types";

interface TaskDetailDialogProps {
  task: Aria2Task | null;
  onClose: () => void;
}

const REFRESH_INTERVAL = 2000;

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

function fileProgress(file: Aria2File): number {
  const total = Number(file.length);
  if (total <= 0) return 0;
  return (Number(file.completedLength) / total) * 100;
}

export function TaskDetailDialog({ task, onClose }: TaskDetailDialogProps) {
  const [files, setFiles] = useState<Aria2File[]>([]);
  const [peers, setPeers] = useState<Aria2Peer[]>([]);
  const [servers, setServers] = useState<Aria2ServerEntry[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const gid = task?.gid ?? null;
  const isBt = Boolean(task?.bittorrent);

  const reload = useCallback(async () => {
    if (!gid) return;
    try {
      const list = await getFiles(gid);
      setFiles(list);
      // Don't clobber edits the user has not saved yet.
      setSelection((current) =>
        dirty
          ? current
          : new Set(
              list.filter((f) => f.selected === "true").map((f) => f.index)
            )
      );
      if (isBt) {
        const [peerList, serverList] = await Promise.all([
          getPeers(gid).catch(() => []),
          getServers(gid).catch(() => []),
        ]);
        setPeers(peerList);
        setServers(serverList);
      } else {
        setServers(await getServers(gid).catch(() => []));
      }
    } catch {
      // Task may have been removed while the dialog was open.
    }
  }, [gid, isBt, dirty]);

  useEffect(() => {
    if (!gid) {
      setFiles([]);
      setPeers([]);
      setServers([]);
      setSelection(new Set());
      setDirty(false);
      return;
    }
    void reload();
    const timer = setInterval(() => void reload(), REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [gid, reload]);

  const toggle = (index: string, checked: boolean) => {
    setSelection((current) => {
      const next = new Set(current);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!gid) return;
    if (selection.size === 0) {
      toast.info(t("detail.needOneFile"));
      return;
    }
    setSaving(true);
    try {
      await selectFiles(gid, [...selection].sort((a, b) => Number(a) - Number(b)));
      setDirty(false);
      toast.success(t("detail.saved"));
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  };

  const multiFile = files.length > 1;

  return (
    <Dialog open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("detail.title")}</DialogTitle>
          <DialogDescription className="truncate">
            {task ? taskName(task) : ""}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="files">
          <TabsList className="w-full">
            <TabsTrigger value="files" className="flex-1">
              {t("detail.files")} {files.length > 0 && files.length}
            </TabsTrigger>
            {isBt && (
              <TabsTrigger value="peers" className="flex-1">
                {t("detail.peers")} {peers.length > 0 && peers.length}
              </TabsTrigger>
            )}
            <TabsTrigger value="servers" className="flex-1">
              {t("detail.servers")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="mt-3">
            <ScrollArea className="h-72 rounded-md border">
              <div className="divide-y">
                {files.length === 0 && (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    {t("detail.noFiles")}
                  </p>
                )}
                {files.map((file) => (
                  <div key={file.index} className="flex items-center gap-3 p-2.5">
                    {multiFile && (
                      <Checkbox
                        checked={selection.has(file.index)}
                        onCheckedChange={(checked) =>
                          toggle(file.index, checked === true)
                        }
                        aria-label={t("task.select", { name: fileName(file.path) })}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-xs"
                        title={file.path}
                      >
                        {fileName(file.path)}
                      </p>
                      <Progress
                        value={fileProgress(file)}
                        className="mt-1.5 h-1"
                      />
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatBytes(file.completedLength)} /{" "}
                      {formatBytes(file.length)}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
            {multiFile && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("detail.selectHint")}
              </p>
            )}
          </TabsContent>

          {isBt && (
            <TabsContent value="peers" className="mt-3">
              <ScrollArea className="h-72 rounded-md border">
                {peers.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    {t("detail.noPeers")}
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80 text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="p-2 text-left font-medium">{t("detail.address")}</th>
                        <th className="p-2 text-right font-medium">{t("detail.down")}</th>
                        <th className="p-2 text-right font-medium">{t("detail.up")}</th>
                        <th className="p-2 text-right font-medium">{t("detail.type")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y tabular-nums">
                      {peers.map((peer) => (
                        <tr key={`${peer.ip}:${peer.port}`}>
                          <td className="p-2 font-mono">
                            {peer.ip}:{peer.port}
                          </td>
                          <td className="p-2 text-right">
                            {formatSpeed(peer.downloadSpeed)}
                          </td>
                          <td className="p-2 text-right">
                            {formatSpeed(peer.uploadSpeed)}
                          </td>
                          <td className="p-2 text-right text-muted-foreground">
                            {peer.seeder === "true" ? t("detail.seeder") : t("detail.leecher")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ScrollArea>
            </TabsContent>
          )}

          <TabsContent value="servers" className="mt-3">
            <ScrollArea className="h-72 rounded-md border">
              {servers.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  {t("detail.noServers")}
                </p>
              ) : (
                <div className="divide-y">
                  {servers.flatMap((entry) =>
                    entry.servers.map((server) => (
                      <div key={`${entry.index}-${server.uri}`} className="p-2.5">
                        <p
                          className="truncate font-mono text-xs"
                          title={server.currentUri}
                        >
                          {server.currentUri}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          {formatSpeed(server.downloadSpeed)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          {dirty && (
            <Button
              variant="outline"
              onClick={() => {
                setDirty(false);
                void reload();
              }}
            >
              {t("detail.discard")}
            </Button>
          )}
          <Button
            onClick={() => (dirty ? void handleSave() : onClose())}
            disabled={saving}
          >
            {dirty
              ? saving
                ? t("detail.saving")
                : t("detail.save")
              : t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
