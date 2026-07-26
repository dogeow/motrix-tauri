import { useEffect, useState } from "react";
import { FileUp, FolderOpen } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  addTorrent,
  addUris,
  pickDirectory,
  pickTorrentFile,
  toastError,
} from "@/lib/actions";
import { useAppStore } from "@/store/app";

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddTaskDialog({ open, onOpenChange }: AddTaskDialogProps) {
  const engine = useAppStore((state) => state.engine);
  const [tab, setTab] = useState<"uri" | "torrent">("uri");
  const [uris, setUris] = useState("");
  const [torrentPath, setTorrentPath] = useState<string | null>(null);
  const [dir, setDir] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setDir((current) => current || engine?.downloadDir || "");
    }
  }, [open, engine]);

  const reset = () => {
    setUris("");
    setTorrentPath(null);
    setTab("uri");
    setSubmitting(false);
  };

  const handlePickTorrent = async () => {
    try {
      const path = await pickTorrentFile();
      if (path) setTorrentPath(path);
    } catch (error) {
      toastError(error);
    }
  };

  const handlePickDir = async () => {
    try {
      const selected = await pickDirectory(dir || undefined);
      if (selected) setDir(selected);
    } catch (error) {
      toastError(error);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (tab === "uri") {
        const list = uris
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        if (list.length === 0) {
          toast.info("请输入至少一个下载链接");
          return;
        }
        const { added, failed } = await addUris(list, dir || undefined);
        if (failed.length > 0) {
          // Keep only the failed lines so resubmitting won't duplicate
          // the tasks that were already added.
          setUris(failed.map((item) => item.uri).join("\n"));
          if (added > 0) {
            toast.warning(
              `已添加 ${added} 个任务，${failed.length} 个失败：${failed[0].error}`
            );
          } else {
            toast.error(`添加失败：${failed[0].error}`);
          }
          return;
        }
        toast.success(`已添加 ${added} 个任务`);
      } else {
        if (!torrentPath) {
          toast.info("请选择种子文件");
          return;
        }
        await addTorrent(torrentPath, dir || undefined);
        toast.success("种子任务已添加");
      }
      reset();
      onOpenChange(false);
    } catch (error) {
      toastError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const torrentFileName = torrentPath
    ? torrentPath.replace(/\\/g, "/").split("/").pop()
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建任务</DialogTitle>
          <DialogDescription>
            支持 HTTP、HTTPS、FTP、磁力链接和种子文件
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(value) => setTab(value as "uri" | "torrent")}>
          <TabsList className="w-full">
            <TabsTrigger value="uri" className="flex-1">
              下载链接
            </TabsTrigger>
            <TabsTrigger value="torrent" className="flex-1">
              种子文件
            </TabsTrigger>
          </TabsList>

          <TabsContent value="uri" className="mt-3">
            <Textarea
              value={uris}
              onChange={(event) => setUris(event.target.value)}
              placeholder={"每行一个链接，例如：\nhttps://example.com/file.zip\nmagnet:?xt=urn:btih:…"}
              rows={5}
              className="resize-none font-mono text-xs"
            />
          </TabsContent>

          <TabsContent value="torrent" className="mt-3">
            <button
              type="button"
              onClick={() => void handlePickTorrent()}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-sm text-muted-foreground transition-colors hover:bg-accent/40"
            >
              <FileUp className="size-6" />
              {torrentFileName ?? "点击选择 .torrent 文件"}
            </button>
          </TabsContent>
        </Tabs>

        <div className="grid gap-2">
          <Label htmlFor="download-dir">下载目录</Label>
          <div className="flex gap-2">
            <Input
              id="download-dir"
              value={dir}
              onChange={(event) => setDir(event.target.value)}
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => void handlePickDir()}
              title="选择目录"
            >
              <FolderOpen className="size-4" />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "提交中…" : "开始下载"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
