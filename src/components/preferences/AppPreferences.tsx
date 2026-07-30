import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { PreferenceRow } from "@/components/preferences/PreferenceControls";
import { LOCALE_NAMES, t, type LocaleSetting } from "@/lib/i18n";
import type { Settings, ThemeMode } from "@/store/settings";
import type { UpdateSetting } from "./types";

interface AppPreferencesProps {
  settings: Settings;
  appVersion: string;
  checkingUpdate: boolean;
  setSetting: UpdateSetting;
  onAutostartChange: (enabled: boolean) => void;
  onCheckUpdate: () => void;
}

export function AppPreferences({
  settings,
  appVersion,
  checkingUpdate,
  setSetting,
  onAutostartChange,
  onCheckUpdate,
}: AppPreferencesProps) {
  return (
    <TabsContent value="app" className="mt-2 divide-y">
      <PreferenceRow label={t("prefs.autostart")}>
        <Switch
          checked={settings.autostart}
          onCheckedChange={onAutostartChange}
        />
      </PreferenceRow>
      <PreferenceRow label={t("prefs.notify")}>
        <Switch
          checked={settings.notifyOnComplete}
          onCheckedChange={(checked) =>
            setSetting("notifyOnComplete", checked)
          }
        />
      </PreferenceRow>
      <PreferenceRow
        label={t("prefs.clipboard")}
        hint={t("prefs.clipboardHint")}
      >
        <Switch
          checked={settings.watchClipboard}
          onCheckedChange={(checked) => setSetting("watchClipboard", checked)}
        />
      </PreferenceRow>
      <PreferenceRow label={t("prefs.theme")}>
        <Select
          value={settings.theme}
          onValueChange={(value) => setSetting("theme", value as ThemeMode)}
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
      </PreferenceRow>
      <PreferenceRow label={t("prefs.language")}>
        <Select
          value={settings.language}
          onValueChange={(value) =>
            setSetting("language", value as LocaleSetting)
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{t("prefs.languageSystem")}</SelectItem>
            {Object.entries(LOCALE_NAMES).map(([code, name]) => (
              <SelectItem key={code} value={code}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PreferenceRow>
      <PreferenceRow
        label={t("prefs.checkUpdate")}
        hint={t("prefs.checkUpdateHint", { version: appVersion })}
      >
        <Button
          variant="outline"
          size="sm"
          disabled={checkingUpdate}
          onClick={onCheckUpdate}
        >
          <RefreshCw
            className={`size-4 ${checkingUpdate ? "animate-spin" : ""}`}
          />
          {t("prefs.checkNow")}
        </Button>
      </PreferenceRow>
    </TabsContent>
  );
}
