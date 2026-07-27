import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import { aria2 } from "./app";
import { setLocale, type LocaleSetting } from "@/lib/i18n";
import type { Aria2Options } from "@/lib/types";

export type ThemeMode = "system" | "light" | "dark";

export interface Settings {
  downloadDir: string;
  maxConcurrentDownloads: number;
  maxConnectionPerServer: number;
  split: number;
  /** aria2 speed strings: "0" means unlimited, otherwise e.g. "512K", "2M". */
  maxOverallDownloadLimit: string;
  maxOverallUploadLimit: string;
  seedRatio: number;
  /** BitTorrent listen port; pinned so a UPnP mapping is meaningful. */
  btPort: number;
  upnp: boolean;
  /** 0 keeps the RPC port random; a fixed port also pins the secret. */
  rpcPort: number;
  notifyOnComplete: boolean;
  watchClipboard: boolean;
  autoUpdateTrackers: boolean;
  theme: ThemeMode;
  language: LocaleSetting;
  autostart: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  downloadDir: "",
  maxConcurrentDownloads: 5,
  maxConnectionPerServer: 16,
  split: 16,
  maxOverallDownloadLimit: "0",
  maxOverallUploadLimit: "0",
  seedRatio: 1,
  btPort: 51413,
  upnp: false,
  rpcPort: 0,
  notifyOnComplete: true,
  watchClipboard: false,
  autoUpdateTrackers: true,
  theme: "system",
  language: "system",
  autostart: false,
};

/**
 * Keep aria2's explicit K/M syntax, but make a bare number user-friendly:
 * preference fields conventionally express speeds in KB/s, while aria2
 * otherwise interprets a bare "1" as one byte per second.
 */
export function normalizeSpeedLimit(value: string): string {
  const normalized = value.trim().toUpperCase() || "0";
  if (normalized === "0") return "0";
  return /^\d+(?:\.\d+)?$/.test(normalized)
    ? `${normalized}K`
    : normalized;
}

/**
 * Only these are changeable on a live aria2 via changeGlobalOption; the rest
 * are per-download options we attach when a task is created.
 */
function globalOptions(settings: Settings): Aria2Options {
  return {
    "max-concurrent-downloads": String(settings.maxConcurrentDownloads),
    "max-overall-download-limit": normalizeSpeedLimit(
      settings.maxOverallDownloadLimit
    ),
    "max-overall-upload-limit": normalizeSpeedLimit(
      settings.maxOverallUploadLimit
    ),
  };
}

/** Options stamped onto every new task, since aria2 cannot change them live. */
export function taskOptions(settings: Settings, trackers: string): Aria2Options {
  const options: Aria2Options = {
    split: String(settings.split),
    "max-connection-per-server": String(settings.maxConnectionPerServer),
    "seed-ratio": String(settings.seedRatio),
    // A torrent's piece hashes let aria2 safely adopt data downloaded by
    // another client even when no aria2 control file exists.
    "check-integrity": "true",
  };
  if (settings.downloadDir) options.dir = settings.downloadDir;
  if (trackers) options["bt-tracker"] = trackers;
  return options;
}

const STORE_FILE = "settings.json";
const TRACKER_KEY = "btTrackers";

let store: Store | null = null;

interface SettingsState {
  settings: Settings;
  trackers: string;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  setTrackers: (trackers: string) => Promise<void>;
  /** Push the runtime-changeable subset to a (re)connected engine. */
  syncToEngine: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  trackers: "",
  loaded: false,

  async load() {
    if (get().loaded) return;
    store = await load(STORE_FILE, { autoSave: true });
    const saved = await store.get<Partial<Settings>>("settings");
    const trackers = (await store.get<string>(TRACKER_KEY)) ?? "";
    const settings = { ...DEFAULT_SETTINGS, ...saved };
    settings.maxOverallDownloadLimit = normalizeSpeedLimit(
      settings.maxOverallDownloadLimit
    );
    settings.maxOverallUploadLimit = normalizeSpeedLimit(
      settings.maxOverallUploadLimit
    );
    setLocale(settings.language);
    set({ settings, trackers, loaded: true });
  },

  async update(patch) {
    const settings = { ...get().settings, ...patch };
    setLocale(settings.language);
    set({ settings });
    await store?.set("settings", settings);
    await get().syncToEngine();
  },

  async setTrackers(trackers) {
    set({ trackers });
    await store?.set(TRACKER_KEY, trackers);
  },

  async syncToEngine() {
    await aria2().call("changeGlobalOption", globalOptions(get().settings));
  },
}));
