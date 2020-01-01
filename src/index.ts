import { EventEmitter, once } from "events";
import fetch from "node-fetch";
import Socket from "./lfe-socket";
import { autoRetry } from "./util";

export const endpoint = "https://www.luogu.com.cn/paintBoard";

export class PaintBoard extends EventEmitter {
  private readonly socket = new Socket("wss://ws.luogu.com.cn/ws");
  private data: number[][] | undefined;

  public constructor() {
    super();
    (async () => {
      await once(this.socket, "open");
      const pending: [number, number, number][] = [];
      this.socket.joinChannel("paintboard", "")
        .on("message.paintboard.", ({ type, x, y, color }) => {
          if (type !== "paintboard_update") return;
          pending.push([x, y, color]);
        });
      const res = await autoRetry(() => fetch(endpoint + "/board"));
      const data = this.data = (await res.text()).trim().split("\n").map(row => Array.from(row, c => parseInt(c, 32)));
      for (const [x, y, color] of pending)
        data[x][y] = color;
      pending.length = 0;
      this.socket.removeAllListeners("message.paintboard.")
        .on("message.paintboard.", ({ type, x, y, color }) => {
          if (type !== "paintboard_update") return;
          data[x][y] = color;
          this.emit("update", x, y, color);
        });
      this.emit("load");
    })();
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

  public async set(x: number, y: number, color: number, uid: number, clientId: string): Promise<void> {
    const data = this.data;
    if (!data) throw new Error("board has not been initialized");
    const res = await fetch(endpoint + "/paint", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": `_uid=${uid}; __client_id=${clientId}`
      },
      body: `x=${x}&y=${y}&color=${color}`,
      method: "POST"
    });
    const { status, data: message } = await res.json();
    if (status < 200 || status >= 300) throw new Error(`failed to set pixel, ${status}: ${message}`);
  }
}
