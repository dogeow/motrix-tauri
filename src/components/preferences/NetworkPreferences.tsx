import { ClipboardCopy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import {
  NumberInput,
  PreferenceRow,
} from "@/components/preferences/PreferenceControls";
import { t } from "@/lib/i18n";
import type { EngineInfo } from "@/lib/types";
import type { Settings } from "@/store/settings";
import type { UpdateSetting } from "./types";

interface NetworkPreferencesProps {
  settings: Settings;
  engine: EngineInfo | null;
  restarting: boolean;
  setSetting: UpdateSetting;
  onCopyRpc: () => void;
  onRestartEngine: () => void;
}

export function NetworkPreferences({
  settings,
  engine,
  restarting,
  setSetting,
  onCopyRpc,
  onRestartEngine,
}: NetworkPreferencesProps) {
  return (
    <TabsContent value="network" className="mt-2 divide-y">
      <PreferenceRow label={t("prefs.btPort")} hint={t("prefs.btPortHint")}>
        <NumberInput
          value={settings.btPort}
          min={1024}
          max={65535}
          onCommit={(value) => setSetting("btPort", value)}
        />
      </PreferenceRow>
      <PreferenceRow label={t("prefs.upnp")} hint={t("prefs.upnpHint")}>
        <Switch
          checked={settings.upnp}
          onCheckedChange={(checked) => setSetting("upnp", checked)}
        />
      </PreferenceRow>
      <PreferenceRow label={t("prefs.rpcPort")} hint={t("prefs.rpcPortHint")}>
        <NumberInput
          value={settings.rpcPort}
          min={0}
          max={65535}
          onCommit={(value) => setSetting("rpcPort", value)}
        />
      </PreferenceRow>
      {engine && (
        <PreferenceRow
          label={t("prefs.rpcAddress")}
          hint={t("prefs.rpcAddressHint")}
        >
          <Button variant="outline" size="sm" onClick={onCopyRpc}>
            <ClipboardCopy className="size-4" />
            127.0.0.1:{engine.rpcPort}
          </Button>
        </PreferenceRow>
      )}
      <PreferenceRow
        label={t("prefs.restartEngine")}
        hint={t("prefs.restartEngineHint")}
      >
        <Button
          variant="outline"
          size="sm"
          disabled={restarting}
          onClick={onRestartEngine}
        >
          <RotateCcw
            className={`size-4 ${restarting ? "animate-spin" : ""}`}
          />
          {t("prefs.restartNow")}
        </Button>
      </PreferenceRow>
    </TabsContent>
  );
}
