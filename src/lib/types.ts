export type TaskStatus =
  | "active"
  | "waiting"
  | "paused"
  | "error"
  | "complete"
  | "removed";

export interface Aria2Uri {
  uri: string;
  status: "used" | "waiting";
}

export interface Aria2File {
  index: string;
  path: string;
  length: string;
  completedLength: string;
  selected: string;
  uris: Aria2Uri[];
}

export interface Aria2Task {
  gid: string;
  status: TaskStatus;
  totalLength: string;
  completedLength: string;
  uploadLength: string;
  downloadSpeed: string;
  uploadSpeed: string;
  connections: string;
  numSeeders?: string;
  seeder?: string;
  errorCode?: string;
  errorMessage?: string;
  dir: string;
  files: Aria2File[];
  infoHash?: string;
  bittorrent?: {
    mode?: string;
    info?: { name?: string };
  };
}

export interface GlobalStat {
  downloadSpeed: string;
  uploadSpeed: string;
  numActive: string;
  numWaiting: string;
  numStopped: string;
}

export interface EngineInfo {
  rpcPort: number;
  rpcSecret: string;
  downloadDir: string;
}
