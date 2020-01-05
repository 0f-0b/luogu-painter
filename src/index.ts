import { EventEmitter } from "events";
import fetch from "node-fetch";
import Socket from "./lfe-socket";
import { autoRetry, Palette } from "./util";

export { Palette };

export const palette: Palette = [
  [0, 0, 0],
  [255, 255, 255],
  [170, 170, 170],
  [85, 85, 85],
  [254, 211, 199],
  [255, 196, 206],
  [250, 172, 142],
  [255, 139, 131],
  [244, 67, 54],
  [233, 30, 99],
  [226, 102, 158],
  [156, 39, 176],
  [103, 58, 183],
  [63, 81, 181],
  [0, 70, 112],
  [5, 113, 151],
  [33, 150, 243],
  [0, 188, 212],
  [59, 229, 219],
  [151, 253, 220],
  [22, 115, 0],
  [55, 169, 60],
  [137, 230, 66],
  [215, 255, 7],
  [255, 246, 209],
  [248, 203, 140],
  [255, 235, 59],
  [255, 193, 7],
  [255, 152, 0],
  [255, 87, 34],
  [184, 63, 39],
  [121, 85, 72]
];

export interface Session {
  uid: number;
  clientId: string;
}

export const endpoint = "https://www.luogu.com.cn/paintBoard";
export const board = endpoint + "/board";
export const paint = endpoint + "/paint";

export class PaintBoard extends EventEmitter {
  private readonly socket = new Socket;
  private data: number[][] | undefined;

  public constructor() {
    super();
    this.socket
      .on("open", this.onOpen.bind(this))
      .on("close", (code, reason) => {
        if (code > 1000 && code < 2000) {
          this.emit("reconnect", reason);
          this.socket.connect();
        }
      });
  }

  private async onOpen(): Promise<void> {
    const pending: [number, number, number][] = [];
    this.socket
      .joinChannel("paintboard", "")
      .on("message.paintboard.", ({ type, x, y, color }) => {
        if (type !== "paintboard_update") return;
        pending.push([x, y, color]);
      });
    const res = await autoRetry(() => fetch(board));
    const data = this.data = (await res.text()).trim().split("\n").map(row => Array.from(row, c => parseInt(c, 32)));
    for (const [x, y, color] of pending)
      data[x][y] = color;
    pending.length = 0;
    this.socket
      .removeAllListeners("message.paintboard.")
      .on("message.paintboard.", ({ type, x, y, color }) => {
        if (type !== "paintboard_update") return;
        data[x][y] = color;
        this.emit("update", x, y, color);
      });
    this.emit("load");
  }

  public get width(): number {
    return this.data?.length ?? 0;
  }

  public get height(): number {
    return this.data?.[0].length ?? 0;
  }

  public get(x: number, y: number): number {
    const data = this.data;
    if (!data) throw new Error("board has not been initialized");
    return data[x][y];
  }

  public async set(x: number, y: number, color: number, { uid, clientId }: Session): Promise<void> {
    const data = this.data;
    if (!data) throw new Error("board has not been initialized");
    const res = await fetch(paint, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": `_uid=${uid}; __client_id=${clientId}`
      },
      body: `x=${x}&y=${y}&color=${color}`,
      method: "POST"
    });
    const { status, data: message } = await res.json();
    if (status < 200 || status >= 300) throw new Error(`failed to set pixel (${status}): ${message}`);
  }
}
