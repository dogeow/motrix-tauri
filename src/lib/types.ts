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

export interface Aria2Peer {
  peerId: string;
  ip: string;
  port: string;
  bitfield: string;
  amChoking: string;
  peerChoking: string;
  downloadSpeed: string;
  uploadSpeed: string;
  seeder: string;
}

export interface Aria2ServerEntry {
  index: string;
  servers: {
    uri: string;
    currentUri: string;
    downloadSpeed: string;
  }[];
}

/** aria2 option bag; every value is a string over the wire. */
export type Aria2Options = Record<string, string>;

export interface EngineInfo {
  rpcPort: number;
  rpcSecret: string;
  downloadDir: string;
}
