import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { Aria2Client } from "@/lib/aria2";
import type { Aria2Task, EngineInfo, GlobalStat } from "@/lib/types";

export type Category = "active" | "waiting" | "stopped";

let client: Aria2Client | null = null;
let initStarted = false;
let pollId: ReturnType<typeof setInterval> | null = null;

/** The singleton aria2 client. Only valid after init() resolves. */
export function aria2(): Aria2Client {
  if (!client) throw new Error("aria2 客户端尚未初始化");
  return client;
}

const POLL_INTERVAL = 1000;

interface AppState {
  engine: EngineInfo | null;
  connected: boolean;
  category: Category;
  tasks: Aria2Task[];
  stat: GlobalStat | null;
  initError: string | null;
  init: () => Promise<void>;
  setCategory: (category: Category) => void;
  refresh: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  engine: null,
  connected: false,
  category: "active",
  tasks: [],
  stat: null,
  initError: null,

  async init() {
    // Guard synchronously — React StrictMode mounts effects twice in dev.
    if (initStarted) return;
    initStarted = true;

    let engine: EngineInfo;
    try {
      engine = await invoke<EngineInfo>("get_engine_info");
    } catch (error) {
      initStarted = false;
      set({ initError: String(error) });
      return;
    }
    set({ engine, initError: null });

    client = new Aria2Client(engine.rpcPort, engine.rpcSecret);
    client.onStatus((connected) => {
      set({ connected });
      if (connected) void get().refresh();
    });
    client.onNotification(() => {
      void get().refresh();
    });
    client.connect();

    pollId = setInterval(() => {
      if (get().connected) void get().refresh();
    }, POLL_INTERVAL);
  },

  setCategory(category) {
    set({ category });
    void get().refresh();
  },

  async refresh() {
    if (!client?.connected) return;
    const { category } = get();
    try {
      const [stat, tasks] = await Promise.all([
        client.call<GlobalStat>("getGlobalStat"),
        category === "active"
          ? client.call<Aria2Task[]>("tellActive")
          : category === "waiting"
            ? client.call<Aria2Task[]>("tellWaiting", 0, 1000)
            : client.call<Aria2Task[]>("tellStopped", 0, 1000),
      ]);
      // Show the most recent stopped tasks first.
      set({ stat, tasks: category === "stopped" ? tasks.reverse() : tasks });
    } catch {
      // Transient RPC failure (e.g. mid-reconnect); onStatus handles state.
    }
  },
}));

// Dev-only: tear down the old WebSocket client and poll loop when Vite
// hot-replaces this module, so HMR doesn't stack duplicates.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    client?.close();
    if (pollId !== null) clearInterval(pollId);
  });
}
