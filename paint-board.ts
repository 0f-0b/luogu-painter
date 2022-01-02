import { LuoguSocket } from "./luogu-socket.ts";
import type { EventListener } from "./util.ts";

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

// deno-fmt-ignore
export const palette = new Uint8Array([
  // colorlist.map(color => "  " + Array.from(color.matchAll(/\d+/g), ([c]) => c + ",").join(" ")).join("\n")
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
  121, 85, 72,
]);

interface PaintBoardEventMap {
  load: CustomEvent<Image>;
  update: CustomEvent<Pixel>;
  close: Event;
  error: Event;
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

export interface PaintBoardOptions {
  boardURL?: string;
  paintURL?: string;
  socket?: string;
}

export interface SetPixelOptions {
  token: string;
}

export class PaintBoard extends EventTarget {
  #width = 0;
  #height = 0;
  #data = new Uint8Array();
  #ready = false;
  readonly #paintURL: string;
  readonly #socket: LuoguSocket;

  constructor(options: PaintBoardOptions = {}) {
    super();
    const boardURL =
      new URL(options.boardURL ?? "https://www.luogu.com.cn/paintboard/board")
        .href;
    this.#paintURL =
      new URL(options.paintURL ?? "https://www.luogu.com.cn/paintboard/paint")
        .href;
    const pending: Pixel[] = [];
    this.#socket = new LuoguSocket(options.socket);
    this.#socket.addEventListener("open", () => {
      const channel = this.#socket.channel("paintboard");
      channel.addEventListener("open", async () => {
        try {
          const res = await fetch(boardURL);
          const text = await res.text();
          const raw = text.trim().split("\n");
          const width = this.#width = raw.length;
          const height = this.#height = raw[0].length;
          const data = this.#data = new Uint8Array(width * height);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              data[y * width + x] = parseInt(raw[x][y], 32);
            }
          }
          for (const { x, y, color } of pending) {
            data[y * width + x] = color;
          }
          pending.length = 0;
          this.#ready = true;
          this.dispatchEvent(
            new CustomEvent("load", {
              detail: { width, height, data: new Uint8Array(data) },
            }),
          );
        } catch {
          this.#error();
        }
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
        if (!this.#ready) {
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
      channel.addEventListener("error", this.#error);
    });
    this.#socket.addEventListener("error", this.#error);
  }

  get(x: number, y: number): number | undefined {
    return x < 0 || x >= this.#width || y < 0 || y >= this.#height
      ? undefined
      : this.#data[y * this.#width + x];
  }

  async set(
    x: number,
    y: number,
    color: number,
    { token }: SetPixelOptions,
  ): Promise<void> {
    const url = new URL(this.#paintURL);
    url.searchParams.append("token", token);
    const res = await fetch(url.href, {
      headers: [
        ["content-type", "application/x-www-form-urlencoded"],
      ],
      body: new URLSearchParams({
        x: String(x),
        y: String(y),
        color: String(color),
      }),
      method: "POST",
    });
    const { status, data }: { status: number; data: string } = await res.json();
    if (status >= 300) {
      throw new PaintBoardError(data, status, token);
    }
  }

  close(): void {
    this.dispatchEvent(new Event("close"));
    this.#socket.close();
  }

  #error = () => {
    this.dispatchEvent(new Event("error"));
    this.close();
  };
}

export class PaintBoardError extends Error {
  code: number;
  token: string;

  constructor(message: string, code: number, token: string) {
    super(message);
    this.name = "PaintBoardError";
    this.code = code;
    this.token = token;
  }
}
