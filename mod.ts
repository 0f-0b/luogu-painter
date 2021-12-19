/// <reference no-default-lib="true" />
/// <reference lib="deno.ns" />
/// <reference lib="dom" />
import { delay } from "https://deno.land/std@0.118.0/async/delay.ts";
import * as iq from "https://esm.sh/image-q@3.0.4";
import type { Image, PaintBoardOptions, Pixel } from "./paint-board.ts";
import { PaintBoard, PaintBoardError } from "./paint-board.ts";
import type { ArrayConvertible, EventListener } from "./util.ts";
import { count, findNextIndex, shuffle } from "./util.ts";

export type { Image, PaintBoardOptions, Pixel };
export { PaintBoard, PaintBoardError };

// deno-fmt-ignore
export const defaultPalette = new Uint8Array([
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
  tokens?: ArrayConvertible<string>;
  randomize?: boolean;
  cooldown?: number;
}

export class LuoguPainter extends EventTarget {
  readonly #pixels: readonly Pixel[];
  readonly #tokens: readonly string[];
  readonly #randomize: boolean;
  readonly #cooldown: number;
  #lastCount?: number;

  constructor({
    image,
    palette = defaultPalette,
    tokens,
    randomize = false,
    cooldown = 30000,
    endpoint,
    socket,
  }: LuoguPainterOptions) {
    super();
    const pixels = dither(image, palette);
    for (const pixel of pixels) {
      pixel.x += image.x;
      pixel.y += image.y;
    }
    this.#pixels = pixels.filter((pixel) => pixel.x >= 0 && pixel.y >= 0);
    this.#tokens = tokens ? Array.from(tokens) : [];
    this.#randomize = randomize;
    this.#cooldown = cooldown;
    this.#connect({ endpoint, socket });
  }

  #connect(options: PaintBoardOptions): void {
    let board: PaintBoard | null = new PaintBoard(options);
    let relevantPixels: Pixel[];
    const needPaint = ({ x, y, color }: Pixel) =>
      board && board.get(x, y) !== color;
    const paint = () => {
      let cur = 0;
      this.#tokens.map(async (token) => {
        while (board) {
          const next = findNextIndex(relevantPixels, cur, needPaint);
          cur = next + 1;
          if (next !== -1) {
            const pixel = relevantPixels[next];
            try {
              await board.set(pixel.x, pixel.y, pixel.color, { token });
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
          }
          await delay(this.#cooldown);
        }
      });
    };
    board.addEventListener("load", (event) => {
      const board = event.detail;
      const { width, height } = board;
      relevantPixels = this.#pixels
        .filter((pixel) => pixel.x < width && pixel.y < height);
      if (this.#randomize) {
        shuffle(relevantPixels);
      }
      this.dispatchEvent(
        new CustomEvent("load", {
          detail: {
            board,
            pixels: relevantPixels.map(({ x, y, color }) => ({ x, y, color })),
            remaining: count(relevantPixels, needPaint),
          },
        }),
      );
      paint();
    });
    board.addEventListener("update", (event) => {
      const pixel = event.detail;
      this.dispatchEvent(
        new CustomEvent("update", {
          detail: {
            pixel,
            remaining: count(relevantPixels, needPaint),
          },
        }),
      );
    });
    board.addEventListener("close", () => {
      board = null;
      this.#connect(options);
    });
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
