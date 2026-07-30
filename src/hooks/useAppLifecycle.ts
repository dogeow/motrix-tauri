import { useEffect } from "react";
import { updateTrackers } from "@/lib/actions";
import { initIntegrations } from "@/lib/integrations";
import { checkForUpdate } from "@/lib/updater";
import { useAppStore } from "@/store/app";
import { useSettingsStore } from "@/store/settings";

/** Owns application-wide startup effects, leaving App focused on composition. */
export function useAppLifecycle(): void {
  const connected = useAppStore((state) => state.connected);
  const init = useAppStore((state) => state.init);
  const loadSettings = useSettingsStore((state) => state.load);
  const autoUpdateTrackers = useSettingsStore(
    (state) => state.settings.autoUpdateTrackers
  );

  useEffect(() => {
    void loadSettings();
    void init();
  }, [init, loadSettings]);

  useEffect(() => {
    const cleanup = initIntegrations();
    return () => {
      void cleanup.then((teardown) => teardown());
    };
  }, []);

  // Stay quiet on launch unless an update is actually waiting.
  useEffect(() => {
    const timer = window.setTimeout(() => void checkForUpdate(true), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  // Refresh trackers once per launch, in the background.
  useEffect(() => {
    if (!connected || !autoUpdateTrackers) return;
    const timer = window.setTimeout(() => {
      void updateTrackers().catch(() => {
        // Offline or blocked; the bundled list stays in effect.
      });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [connected, autoUpdateTrackers]);
}
