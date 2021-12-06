import { LuoguSocket } from "./luogu-socket.ts";
import { Session } from "./session.ts";
import type { EventListener } from "./util.ts";
import { retry, timeout } from "./util.ts";

// deno-fmt-ignore
export const palette = new Uint8Array([
  // colorlist.flatMap(color => Array.from(color.matchAll(/\d+/g), c => parseInt(c, 10)))
  0, 0, 0,
  255, 255, 255,
  170, 170, 170,
  85, 85, 85,
  254, 211, 199,
  255, 196, 206,
  250, 172, 142,
  255, 139, 131,
  244, 67, 54,
  233, 30, 99,
  226, 102, 158,
  156, 39, 176,
  103, 58, 183,
  63, 81, 181,
  0, 70, 112,
  5, 113, 151,
  33, 150, 243,
  0, 188, 212,
  59, 229, 219,
  151, 253, 220,
  22, 115, 0,
  55, 169, 60,
  137, 230, 66,
  215, 255, 7,
  255, 246, 209,
  248, 203, 140,
  255, 235, 59,
  255, 193, 7,
  255, 152, 0,
  255, 87, 34,
  184, 63, 39,
  121, 85, 72
]);

export interface Pixel {
  x: number;
  y: number;
  color: number;
}

export interface Image {
  width: number;
  height: number;
  data: Uint8Array;
}

interface PaintBoardEventMap {
  load: CustomEvent<Image>;
  update: CustomEvent<Pixel>;
}

export interface PaintBoard extends EventTarget {
  addEventListener<K extends keyof PaintBoardEventMap>(
    type: K,
    listener: EventListener<PaintBoard, PaintBoardEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListener<PaintBoard, Event>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof PaintBoardEventMap>(
    type: K,
    listener: EventListener<PaintBoard, PaintBoardEventMap[K]>,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener<PaintBoard, Event>,
    options?: boolean | EventListenerOptions,
  ): void;
}

export class PaintBoard extends EventTarget {
  readonly endpoint: string;
  readonly socket: string | undefined;
  #width = 0;
  #data = new Uint8Array();

  constructor(
    endpoint = "https://www.luogu.com.cn/paintBoard",
    socket?: string,
  ) {
    super();
    this.endpoint = endpoint;
    this.socket = socket;
    this.#connect();
  }

  #connect(): void {
    const pending: Pixel[] = [];
    const board = new URL(this.endpoint + "/board");
    const socket = new LuoguSocket(this.socket);
    socket.addEventListener("open", () => {
      const channel = socket.channel("paintboard");
      channel.addEventListener("open", async () => {
        const { width, height, data } = await retry(async () => {
          const text = await timeout(30000, async (signal) => {
            const res = await fetch(board, { signal });
            return await res.text();
          });
          const raw = text.trim().split("\n");
          const width = this.#width = raw.length;
          const height = raw[0].length;
          const data = this.#data = new Uint8Array(width * height);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              data[y * width + x] = parseInt(raw[x][y], 32);
            }
          }
          return { width, height, data };
        });
        for (const { x, y, color } of pending) {
          data[y * width + x] = color;
        }
        pending.length = 0;
        this.dispatchEvent(
          new CustomEvent("load", {
            detail: { width, height, data: new Uint8Array(data) },
          }),
        );
      });
      channel.addEventListener("message", (event) => {
        const message = event.data;
        if (message._ws_type !== "server_broadcast") {
          return;
        }
        const { type, x, y, color } = message as unknown as {
          type: string;
          x: number;
          y: number;
          color: number;
        };
        if (type !== "paintboard_update") {
          return;
        }
        if (!this.#data) {
          pending.push({ x, y, color });
          return;
        }
        this.#data[y * this.#width + x] = color;
        this.dispatchEvent(
          new CustomEvent("update", {
            detail: { x, y, color },
          }),
        );
      });
      channel.addEventListener("close", () => socket.close());
    });
    socket.addEventListener("close", () => this.#connect());
  }

  get(x: number, y: number): number | undefined {
    return this.#data[y * this.#width + x];
  }

  async set(
    x: number,
    y: number,
    color: number,
    session: Session,
  ): Promise<void> {
    const { status, data } = await retry(async () => {
      const { status, data } = await timeout<{
        status: number;
        data: unknown;
      }>(30000, async (signal) => {
        const res = await fetch(this.endpoint + "/paint", {
          headers: [
            ["content-type", "application/x-www-form-urlencoded"],
            ["cookie", `_uid=${session.uid}; __client_id=${session.clientId}`],
          ],
          body: new URLSearchParams({
            x: String(x),
            y: String(y),
            color: String(color),
          }),
          method: "POST",
          signal,
        });
        return await res.json();
      });
      if (status === 408 || status >= 500) {
        throw Object.assign(new Error(String(data)), { status });
      }
      return { status, data };
    });
    if (status >= 300) {
      throw Object.assign(new Error(String(data)), { status });
    }
  }
}
