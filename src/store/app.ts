import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { Aria2Client } from "@/lib/aria2";
import type { Aria2Task, EngineInfo, GlobalStat } from "@/lib/types";

export type Category = "all" | "active" | "waiting" | "stopped";

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
  category: "all",
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
        fetchTasks(client, category),
      ]);
      set({ stat, tasks });
    } catch {
      // Transient RPC failure (e.g. mid-reconnect); onStatus handles state.
    }
  },
}));

const MAX_LISTED = 1000;

/** Newest stopped tasks first — aria2 appends them chronologically. */
function tellStopped(client: Aria2Client): Promise<Aria2Task[]> {
  return client
    .call<Aria2Task[]>("tellStopped", 0, MAX_LISTED)
    .then((tasks) => tasks.reverse());
}

function fetchTasks(
  client: Aria2Client,
  category: Category
): Promise<Aria2Task[]> {
  switch (category) {
    case "active":
      return client.call<Aria2Task[]>("tellActive");
    case "waiting":
      return client.call<Aria2Task[]>("tellWaiting", 0, MAX_LISTED);
    case "stopped":
      return tellStopped(client);
    case "all":
      return Promise.all([
        client.call<Aria2Task[]>("tellActive"),
        client.call<Aria2Task[]>("tellWaiting", 0, MAX_LISTED),
        tellStopped(client),
      ]).then(([active, waiting, stopped]) => [
        ...active,
        ...waiting,
        ...stopped,
      ]);
  }
}

// Dev-only: tear down the old WebSocket client and poll loop when Vite
// hot-replaces this module, so HMR doesn't stack duplicates.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    client?.close();
    if (pollId !== null) clearInterval(pollId);
  });
}
