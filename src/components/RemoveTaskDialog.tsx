import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { removeTask, toastError } from "@/lib/actions";
import { taskName } from "@/lib/format";
import type { Aria2Task } from "@/lib/types";

interface RemoveTaskDialogProps {
  /** Snapshot of the task pending removal; null closes the dialog. */
  task: Aria2Task | null;
  /** Additional tasks removed alongside it when a selection is active. */
  extraTasks?: Aria2Task[];
  onClose: () => void;
}

/**
 * Rendered once at App level (not inside the polled task rows) so the
 * confirmation survives the row unmounting when a task changes category.
 */
export function RemoveTaskDialog({
  task,
  extraTasks = [],
  onClose,
}: RemoveTaskDialogProps) {
  const [deleteFiles, setDeleteFiles] = useState(false);

  const targets = task ? [task, ...extraTasks] : [];
  const name = task ? taskName(task) : "";

  const close = () => {
    setDeleteFiles(false);
    onClose();
  };

  const handleConfirm = async () => {
    try {
      // Sequential: aria2 races removal against its own bookkeeping, and a
      // parallel burst makes "record not found" errors far more likely.
      let failed = 0;
      for (const target of targets) {
        try {
          await removeTask(target, deleteFiles);
        } catch {
          failed += 1;
        }
      }
      if (failed > 0) {
        toast.warning(`已删除 ${targets.length - failed} 个，${failed} 个失败`);
      } else {
        toast.success(
          deleteFiles ? "任务和文件已删除" : `已删除 ${targets.length} 个任务`
        );
      }
    } catch (error) {
      toastError(error);
    } finally {
      close();
    }
  };

  return (
    <AlertDialog
      open={task !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除任务</AlertDialogTitle>
          <AlertDialogDescription>
            {targets.length > 1 ? (
              `确定要删除选中的 ${targets.length} 个任务吗？`
            ) : (
              <>
                确定要删除以下任务吗？
                {/* Task names can be long unbroken strings (magnet hashes),
                    so force wrapping and cap the height. */}
                <span
                  className="mt-1.5 line-clamp-3 block break-all font-medium text-foreground"
                  title={name}
                >
                  {name}
                </span>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2">
          <Checkbox
            id="remove-delete-files"
            checked={deleteFiles}
            onCheckedChange={(checked) => setDeleteFiles(checked === true)}
          />
          <Label htmlFor="remove-delete-files" className="font-normal">
            同时删除文件（移入回收站）
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleConfirm()}>
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
