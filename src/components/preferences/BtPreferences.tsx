import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import {
  NumberInput,
  PreferenceRow,
} from "@/components/preferences/PreferenceControls";
import { t } from "@/lib/i18n";
import type { Settings } from "@/store/settings";
import type { UpdateSetting } from "./types";

interface BtPreferencesProps {
  settings: Settings;
  trackerCount: number;
  updatingTrackers: boolean;
  setSetting: UpdateSetting;
  onUpdateTrackers: () => void;
}

export function BtPreferences({
  settings,
  trackerCount,
  updatingTrackers,
  setSetting,
  onUpdateTrackers,
}: BtPreferencesProps) {
  return (
    <TabsContent value="bt" className="mt-2 divide-y">
      <PreferenceRow
        label={t("prefs.seedRatio")}
        hint={t("prefs.seedRatioHint")}
      >
        <NumberInput
          value={settings.seedRatio}
          min={0}
          max={100}
          onCommit={(value) => setSetting("seedRatio", value)}
        />
      </PreferenceRow>
      <PreferenceRow
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
          onClick={onUpdateTrackers}
        >
          <RefreshCw
            className={`size-4 ${updatingTrackers ? "animate-spin" : ""}`}
          />
          {t("prefs.trackersUpdate")}
        </Button>
      </PreferenceRow>
      <PreferenceRow label={t("prefs.trackersAuto")}>
        <Switch
          checked={settings.autoUpdateTrackers}
          onCheckedChange={(checked) =>
            setSetting("autoUpdateTrackers", checked)
          }
        />
      </PreferenceRow>
    </TabsContent>
  );
}
