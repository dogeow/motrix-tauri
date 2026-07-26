import { t } from "./i18n";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface JsonRpcResponse {
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
  method?: string;
  params?: Array<{ gid: string }>;
}

export type NotificationHandler = (method: string, gid: string) => void;
export type StatusHandler = (connected: boolean) => void;

const RECONNECT_DELAY = 1000;

/**
 * Minimal aria2 JSON-RPC client over WebSocket.
 * Runs entirely in the webview — the Rust side only owns the aria2c process.
 */
export class Aria2Client {
  private ws: WebSocket | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private closed = false;
  private notificationHandlers = new Set<NotificationHandler>();
  private statusHandlers = new Set<StatusHandler>();

  constructor(
    private readonly port: number,
    private readonly secret: string
  ) {}

  connect(): void {
    this.closed = false;
    this.open();
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  call<T>(method: string, ...params: unknown[]): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error(t("engine.notReady")));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: `aria2.${method}`,
          params: [`token:${this.secret}`, ...params],
        })
      );
    });
  }

  private open(): void {
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/jsonrpc`);
    this.ws = ws;

    ws.onopen = () => {
      this.statusHandlers.forEach((handler) => handler(true));
    };
    ws.onmessage = (event) => {
      this.handleMessage(String(event.data));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.statusHandlers.forEach((handler) => handler(false));
      this.rejectAll(new Error(t("engine.disconnected")));
      if (!this.closed) {
        setTimeout(() => {
          if (!this.closed) this.open();
        }, RECONNECT_DELAY);
      }
    };
  }

  private handleMessage(data: string): void {
    let message: JsonRpcResponse;
    try {
      message = JSON.parse(data) as JsonRpcResponse;
    } catch {
      return;
    }

    // Push notification (aria2.onDownloadStart / Complete / Error / ...)
    if (message.method) {
      const gid = message.params?.[0]?.gid ?? "";
      this.notificationHandlers.forEach((handler) =>
        handler(message.method as string, gid)
      );
      return;
    }

    if (message.id === undefined || message.id === null) return;
    const pending = this.pending.get(Number(message.id));
    if (!pending) return;
    this.pending.delete(Number(message.id));

    if (message.error) {
      pending.reject(new Error(message.error.message));
    } else {
      pending.resolve(message.result);
    }
  }

  private rejectAll(error: Error): void {
    this.pending.forEach((pending) => pending.reject(error));
    this.pending.clear();
  }
}
