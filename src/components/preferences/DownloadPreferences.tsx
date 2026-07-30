import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import {
  NumberInput,
  PreferenceRow,
  SpeedInput,
} from "@/components/preferences/PreferenceControls";
import { t } from "@/lib/i18n";
import { normalizeUploadSpeedLimit } from "@/lib/speed-limit";
import type { EngineInfo } from "@/lib/types";
import type { Settings } from "@/store/settings";
import type { UpdateSetting } from "./types";

interface DownloadPreferencesProps {
  settings: Settings;
  engine: EngineInfo | null;
  setSetting: UpdateSetting;
  onPickDirectory: () => void;
}

export function DownloadPreferences({
  settings,
  engine,
  setSetting,
  onPickDirectory,
}: DownloadPreferencesProps) {
  const downloadDir = settings.downloadDir || engine?.downloadDir;

  return (
    <TabsContent value="download" className="mt-2 divide-y">
      <PreferenceRow label={t("prefs.dir")}>
        <div className="flex items-center gap-2">
          <span
            className="max-w-52 truncate font-mono text-xs text-muted-foreground"
            title={downloadDir}
          >
            {downloadDir || "—"}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={onPickDirectory}
            aria-label={t("common.chooseDir")}
          >
            <FolderOpen className="size-4" />
          </Button>
        </div>
      </PreferenceRow>
      <PreferenceRow label={t("prefs.concurrent")} hint={t("prefs.applyNow")}>
        <NumberInput
          value={settings.maxConcurrentDownloads}
          min={1}
          max={50}
          onCommit={(value) => setSetting("maxConcurrentDownloads", value)}
        />
      </PreferenceRow>
      <PreferenceRow label={t("prefs.connections")} hint={t("prefs.applyNew")}>
        <NumberInput
          value={settings.maxConnectionPerServer}
          min={1}
          max={64}
          onCommit={(value) => setSetting("maxConnectionPerServer", value)}
        />
      </PreferenceRow>
      <PreferenceRow label={t("prefs.split")} hint={t("prefs.applyNew")}>
        <NumberInput
          value={settings.split}
          min={1}
          max={64}
          onCommit={(value) => setSetting("split", value)}
        />
      </PreferenceRow>
      <PreferenceRow
        label={t("prefs.downLimit")}
        hint={t("prefs.downLimitHint")}
      >
        <SpeedInput
          value={settings.maxOverallDownloadLimit}
          onCommit={(value) => setSetting("maxOverallDownloadLimit", value)}
        />
      </PreferenceRow>
      <PreferenceRow label={t("prefs.upLimit")} hint={t("prefs.upLimitHint")}>
        <SpeedInput
          value={settings.maxOverallUploadLimit}
          onCommit={(value) => setSetting("maxOverallUploadLimit", value)}
          normalize={normalizeUploadSpeedLimit}
          title="0 = unlimited; minimum stable BT limit is 16 KB/s"
        />
      </PreferenceRow>
    </TabsContent>
  );
}
