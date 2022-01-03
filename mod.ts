/// <reference no-default-lib="true" />
/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import { deferred } from "https://deno.land/std@0.119.0/async/deferred.ts";
import { delay } from "https://deno.land/std@0.119.0/async/delay.ts";
import * as iq from "https://esm.sh/image-q@3.0.5?pin=v59";
import {
  Image,
  PaintBoardOptions,
  palette as defaultPalette,
  Pixel,
} from "./paint-board.ts";
import { PaintBoard, PaintBoardError } from "./paint-board.ts";
import type { EventListener } from "./util.ts";
import { shuffle } from "./util.ts";

export type { Image, PaintBoardOptions, Pixel };
export { defaultPalette, PaintBoard, PaintBoardError };

function dither({ width, height, data }: Image, palette: Uint8Array): Pixel[] {
  const quant = new iq.image.ErrorDiffusionArray(
    new iq.distance.CIEDE2000(),
    iq.image.ErrorDiffusionArrayKernel.FloydSteinberg,
  );
  const inpc = iq.utils.PointContainer.fromUint8Array(data, width, height);
  const pal = new iq.utils.Palette();
  const palU32: number[] = [];
  pal.add(iq.utils.Point.createByRGBA(0, 0, 0, 0));
  for (let i = 0, len = palette.length; i < len; i += 3) {
    const point = iq.utils.Point.createByRGBA(
      palette[i],
      palette[i + 1],
      palette[i + 2],
      255,
    );
    pal.add(point);
    palU32.push(point.uint32);
  }
  const outpc = quant.quantizeSync(inpc, pal);
  const points = outpc.getPointArray();
  const pixels: Pixel[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = palU32.indexOf(points[y * width + x].uint32);
      if (color !== -1) {
        pixels.push({ x, y, color });
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
  load: CustomEvent<{ board: Image; pixels: Pixel[]; remaining: number }>;
  update: CustomEvent<{ pixel: Pixel; remaining: number }>;
  paint: CustomEvent<Pixel>;
  error: CustomEvent;
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
  palette?: Uint8Array;
  tokens?: Iterable<string>;
  randomize?: boolean;
  cooldown?: number;
  reloadInterval?: number;
}

export class LuoguPainter extends EventTarget {
  readonly #pixels = new Map<`${number},${number}`, Pixel>();
  readonly #randomize: boolean;
  readonly #cooldown: number;
  readonly #reloadInterval: number;
  readonly #pending = new Set<Pixel>();
  #lock = deferred();
  #board!: PaintBoard;

  constructor({
    image,
    palette = defaultPalette,
    tokens,
    randomize = false,
    cooldown = 31000,
    reloadInterval = 300000,
    boardURL,
    paintURL,
    socket,
  }: LuoguPainterOptions) {
    super();
    const pixels = this.#pixels;
    for (const pixel of dither(image, palette)) {
      pixel.x += image.x;
      pixel.y += image.y;
      if (pixel.x >= 0 && pixel.y >= 0) {
        pixels.set(`${pixel.x},${pixel.y}`, pixel);
      }
    }
    this.#randomize = randomize;
    this.#cooldown = cooldown;
    this.#reloadInterval = reloadInterval;
    this.#connect({ boardURL, paintURL, socket });
    if (tokens) {
      for (const token of tokens) {
        this.#paint(token);
      }
    }
  }

  #connect(options: PaintBoardOptions): void {
    const board = this.#board = new PaintBoard(options);
    board.addEventListener("load", (event) => {
      const data = event.detail;
      const { width, height } = data;
      const relevant: Pixel[] = [];
      for (const pixel of this.#pixels.values()) {
        if (pixel.x < width && pixel.y < height) {
          relevant.push(pixel);
        }
      }
      if (this.#randomize) {
        shuffle(relevant);
      }
      const pending = this.#pending;
      pending.clear();
      for (const pixel of relevant) {
        if (board.get(pixel.x, pixel.y) !== pixel.color) {
          pending.add(pixel);
        }
      }
      this.#notify();
      this.dispatchEvent(
        new CustomEvent("load", {
          detail: {
            board: data,
            pixels: relevant.map(({ x, y, color }) => ({ x, y, color })),
            remaining: pending.size,
          },
        }),
      );
      const id = setTimeout(() => board.close(), this.#reloadInterval);
      board.addEventListener("close", () => clearTimeout(id), { once: true });
    });
    board.addEventListener("update", (event) => {
      const data = event.detail;
      const pixel = this.#pixels.get(`${data.x},${data.y}`);
      const pending = this.#pending;
      if (pixel) {
        if (data.color === pixel.color) {
          pending.delete(pixel);
        } else {
          pending.add(pixel);
        }
        this.#notify();
      }
      this.dispatchEvent(
        new CustomEvent("update", {
          detail: {
            pixel: data,
            remaining: pending.size,
          },
        }),
      );
    });
    board.addEventListener("close", () => this.#connect(options), {
      once: true,
    });
  }

  async #paint(token: string): Promise<never> {
    for (;;) {
      await this.#lock;
      const [pixel] = this.#pending;
      if (!this.#pending.delete(pixel)) {
        continue;
      }
      this.#pending.add(pixel);
      try {
        await this.#board.set(pixel.x, pixel.y, pixel.color, { token });
        this.dispatchEvent(
          new CustomEvent("paint", {
            detail: pixel,
          }),
        );
      } catch (e: unknown) {
        this.dispatchEvent(
          new CustomEvent("error", {
            detail: e,
          }),
        );
      }
      await delay(this.#cooldown);
    }
  }

  #notify(): void {
    if (this.#pending.size === 0) {
      if (this.#lock.state !== "pending") {
        this.#lock = deferred();
      }
    } else {
      this.#lock.resolve();
    }
  }
}

export function parseTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (let line of text.split("\n")) {
    line = line.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    if (tokens.has(line)) {
      throw new TypeError(`Duplicate token '${line}'`);
    }
    tokens.add(line);
  }
  return Array.from(tokens);
}
