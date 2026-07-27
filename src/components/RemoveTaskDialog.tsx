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
import { t } from "@/lib/i18n";
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
      const errors: string[] = [];
      for (const target of targets) {
        try {
          await removeTask(target, deleteFiles);
        } catch (error) {
          failed += 1;
          errors.push(
            `${taskName(target)}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
      if (failed > 0) {
        toast.warning(
          t("remove.partial", {
            done: targets.length - failed,
            failed,
            error: errors[0],
          })
        );
      } else {
        toast.success(
          deleteFiles
            ? t("remove.doneWithFiles")
            : t("remove.done", { count: targets.length })
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
          <AlertDialogTitle>{t("remove.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {targets.length > 1 ? (
              t("remove.confirmMany", { count: targets.length })
            ) : (
              <>
                {t("remove.confirmOne")}
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
            {t("remove.withFiles")}
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleConfirm()}>
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
