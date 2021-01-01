import { EventEmitter } from "events";
import retry from "p-retry";
import { URLSearchParams } from "url";
import { debuglog } from "util";
import { Socket } from "./luogu-socket";
import { fetchJsonWithTimeout, fetchTextWithTimeout } from "./util";

const debug = debuglog("luogu-painter");

// colorlist.flatMap(color => Array.from(color.matchAll(/\d+/g), c => parseInt(c, 10)));
export const palette = new Uint8Array([
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

export interface Session {
  uid: number;
  clientId: string;
}

export interface Pixel {
  y: number;
  x: number;
  color: number;
}

export class PaintBoard extends EventEmitter {
  private readonly _socket: Socket;
  private _width = 0;
  private _data = new Uint8Array;

  public constructor(public readonly endpoint: string, public readonly socketUrl: string) {
    super();
    const pending: Pixel[] = [];
    (this._socket = new Socket(socketUrl)).channel("paintboard")
      .on("join", () => void retry(() => this._board()).then(({ width, height, data }) => {
        for (const { x, y, color } of pending)
          data[y * width + x] = color;
        pending.length = 0;
        debug("load", width, height, data.join(""));
        this.emit("load", width, height, new Uint8Array(data));
      }))
      .on("message", ({ type, y, x, color }: { type: string; } & Pixel) => {
        if (type !== "paintboard_update")
          return;
        if (!this._data) {
          pending.push({ y, x, color });
          return;
        }
        this._data[y * this._width + x] = color;
        debug("update", y, x, color);
        this.emit("update", y, x, color);
      });
  }

  public close(): void {
    this._socket.close();
    this._width = 0;
    this._data = new Uint8Array;
  }

  public get(y: number, x: number): number | undefined {
    return this._data[y * this._width + x];
  }

  public async set(y: number, x: number, color: number, { uid, clientId }: Session): Promise<void> {
    const { status, data } = await retry(async () => {
      const { status, data } = await fetchJsonWithTimeout(this.endpoint + "/paint", 30000, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": `_uid=${uid}; __client_id=${clientId}`
        },
        body: new URLSearchParams({
          x: x.toString(),
          y: y.toString(),
          color: color.toString()
        }),
        method: "POST"
      }) as { status: number; data: unknown; };
      if (status === 408 || status >= 500) // transient error
        throw Object.assign(new Error(String(data)), { status });
      return { status, data };
    });
    if (status >= 300)
      throw Object.assign(new Error(String(data)), { status });
  }

  private async _board(): Promise<{ width: number; height: number; data: Uint8Array; }> {
    const text = await fetchTextWithTimeout(this.endpoint + "/board", 30000);
    const raw = text.trim().split("\n").map(line => Array.from(line, c => parseInt(c, 32)));
    const width = this._width = raw.length;
    const height = raw[0].length;
    const data = this._data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        data[y * width + x] = raw[x][y];
    return { width, height, data };
  }
}
