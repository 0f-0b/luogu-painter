import { EventEmitter } from "events";
import fetch from "node-fetch";
import retry from "p-retry";
import { URLSearchParams } from "url";
import { Socket } from "./lfe-socket";
import { fetchLuogu } from "./luogu-api";

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
  x: number;
  y: number;
  color: number;
}

export class PaintBoard extends EventEmitter {
  private static readonly endpoint = "https://www.luogu.com.cn/paintBoard";
  private static readonly board = PaintBoard.endpoint + "/board";
  private static readonly paint = PaintBoard.endpoint + "/paint";
  private readonly socket = new Socket;
  private data: number[][] | undefined;

  public constructor() {
    super();
    this.socket
      .on("open", () => {
        const pending: Pixel[] = [];
        this.socket
          .channel("paintboard")
          .on("join", () => void retry(() => fetch(PaintBoard.board).then(res => res.text()))
            .then(text => {
              this.data = text.trim().split("\n")
                .map(line => Array.from(line, c => parseInt(c, 32)));
              for (const { x, y, color } of pending)
                this.data[x][y] = color;
              pending.length = 0;
              this.emit("load");
            })
            .catch(error => this.emit("error", error)))
          .on("message", ({ type, x, y, color }: { type: string; } & Pixel) => {
            if (type !== "paintboard_update")
              return;
            if (this.data) {
              this.data[x][y] = color;
              this.emit("update", x, y, color);
            } else
              pending.push({ x, y, color });
          });
      })
      .on("error", this.emit.bind(this, "error"));
  }

  public get width(): number {
    return this.data?.length ?? 0;
  }

  public get height(): number {
    return this.data?.[0].length ?? 0;
  }

  public get(x: number, y: number): number | undefined {
    return this.data?.[x][y];
  }

  public async set(x: number, y: number, color: number, { uid, clientId }: Session): Promise<void> {
    await fetchLuogu(PaintBoard.paint, {
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
    });
  }
}
