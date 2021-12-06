import { delay } from "https://deno.land/std@0.117.0/async/delay.ts";
import ditherImage from "https://esm.sh/dither-image@0.2.0";
import type { Image, PaintBoardOptions, Pixel } from "./paint-board.ts";
import { PaintBoard, PaintBoardError } from "./paint-board.ts";
import type { Session } from "./session.ts";
import { ArrayConvertible, count, EventListener } from "./util.ts";
import { findNextIndex, shuffle } from "./util.ts";

export { parseSessions } from "./session.ts";
export type { Image, PaintBoardOptions, Pixel };
export { PaintBoard, PaintBoardError };

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

function getPixels({ width, height, data }: Image): Pixel[] {
  const colors = ditherImage(width, height, data, palette);
  const pixels: Pixel[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (data[index * 4 + 3] >= 0x80) {
        pixels.push({ x, y, color: colors[index] });
      }
    }
  }
  return pixels;
}

export interface ImageWithOffset extends Image {
  x: number;
  y: number;
}

interface LuoguPainterEventMap {
  load: CustomEvent<{ board: Image; total: number }>;
  update: CustomEvent<{ remaining: number }>;
  paint: CustomEvent<{ session: Session; pixel: Pixel }>;
  error: CustomEvent<{ session: Session; error: unknown }>;
}

export interface LuoguPainter extends EventTarget {
  addEventListener<K extends keyof LuoguPainterEventMap>(
    type: K,
    listener: EventListener<LuoguPainter, LuoguPainterEventMap[K]>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListener<LuoguPainter, Event>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof LuoguPainterEventMap>(
    type: K,
    listener: EventListener<LuoguPainter, LuoguPainterEventMap[K]>,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener<LuoguPainter, Event>,
    options?: boolean | EventListenerOptions,
  ): void;
}

export interface LuoguPainterOptions extends PaintBoardOptions {
  image: ImageWithOffset;
  sessions?: ArrayConvertible<Session>;
  randomize?: boolean;
  cooldown?: number;
}

export class LuoguPainter extends EventTarget {
  readonly #pixels: readonly Pixel[];
  readonly #sessions: readonly Session[];
  readonly #randomize: boolean;
  readonly #cooldown: number;
  #lastCount?: number;

  constructor({
    image,
    sessions,
    randomize = false,
    cooldown = 30000,
    endpoint,
    socket,
  }: LuoguPainterOptions) {
    super();
    const pixels = getPixels(image);
    for (const pixel of pixels) {
      pixel.x += image.x;
      pixel.y += image.y;
    }
    this.#pixels = pixels;
    this.#sessions = sessions
      ? Array.from(sessions, ({ uid, clientId }) => ({ uid, clientId }))
      : [];
    this.#randomize = randomize;
    this.#cooldown = cooldown;
    this.#connect({ endpoint, socket });
  }

  #connect(options: PaintBoardOptions): void {
    const sessions = this.#sessions;
    let board: PaintBoard | null = new PaintBoard(options);
    let relevantPixels: Pixel[];
    const needPaint = ({ x, y, color }: Pixel) =>
      board && board.get(x, y) !== color;
    const update = () => {
      const curCount = count(relevantPixels, needPaint);
      if (curCount !== this.#lastCount) {
        this.#lastCount = curCount;
        this.dispatchEvent(
          new CustomEvent("update", {
            detail: { remaining: curCount },
          }),
        );
      }
    };
    const paint = async () => {
      if (sessions.length === 0) {
        return;
      }
      const cooldown = Math.ceil(this.#cooldown / sessions.length);
      let sessionIndex = 0;
      let cur = 0;
      while (board) {
        const session = sessions[sessionIndex++];
        if (sessionIndex === sessions.length) {
          sessionIndex = 0;
        }
        const next = findNextIndex(relevantPixels, cur, needPaint);
        cur = next + 1;
        if (next !== -1) {
          const pixel = relevantPixels[next];
          await board.set(pixel.x, pixel.y, pixel.color, session)
            .then(
              () =>
                this.dispatchEvent(
                  new CustomEvent("paint", {
                    detail: { session, pixel },
                  }),
                ),
              (error: unknown) =>
                this.dispatchEvent(
                  new CustomEvent("error", {
                    detail: { session, error },
                  }),
                ),
            );
        }
        await delay(cooldown);
      }
    };
    board.addEventListener("load", (event) => {
      const board = event.detail;
      const { width, height } = board;
      relevantPixels = this.#pixels.filter((pixel) =>
        pixel.x >= 0 && pixel.x < width &&
        pixel.y >= 0 && pixel.y < height
      );
      if (this.#randomize) {
        shuffle(relevantPixels);
      }
      this.dispatchEvent(
        new CustomEvent("load", {
          detail: { board, total: relevantPixels.length },
        }),
      );
      update();
      paint();
    });
    board.addEventListener("update", () => {
      update();
    });
    board.addEventListener("close", () => {
      board = null;
      this.#connect(options);
    });
  }
}
