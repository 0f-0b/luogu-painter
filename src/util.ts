import { diff as colorDiff, LabColor, rgb_to_lab as rgbToLab } from "color-diff";
import { once } from "events";
import * as fs from "fs";
import { PNG } from "pngjs";

export function findNextIndex<T>(arr: readonly T[], begin: number, predicate: (value: T, index: number, obj: readonly T[]) => unknown): number {
  for (let i = begin, len = arr.length; i < len; i++)
    if (predicate(arr[i], i, arr)) return i;
  for (let i = 0; i < begin; i++)
    if (predicate(arr[i], i, arr)) return i;
  return -1;
}

export function shuffle<T>(arr: T[]): T[] {
  for (let len = arr.length; len;) {
    const index = Math.trunc(Math.random() * len--);
    const tmp = arr[len];
    arr[len] = arr[index];
    arr[index] = tmp;
  }
  return arr;
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function autoRetry<T>(func: () => Promise<T>, maxCount = 0): Promise<T> {
  return new Promise(function retry(resolve, reject) {
    func().then(resolve, error => --maxCount ? setTimeout(retry, 500, resolve, reject) : reject(error));
  });
}

export interface Image {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export type Palette = readonly (readonly [number, number, number])[];
export type Pixels = [number, number, number][];

export function toPixels({ width, height, data }: Image, imageX: number, imageY: number, boardWidth: number, boardHeight: number, palette: Palette): Pixels {
  const startX = Math.max(-imageX, 0);
  const startY = Math.max(-imageY, 0);
  const endX = Math.min(boardWidth - imageX, width);
  const endY = Math.min(boardHeight - imageY, height);
  const pixels: Pixels = [];
  const paletteSize = palette.length;
  if (!paletteSize) throw new Error("palette is empty");
  const paletteColors: readonly LabColor[] = palette.map(([red, green, blue]) => rgbToLab({ R: red, G: green, B: blue }));
  for (let y = startY; y < endY; y++)
    for (let x = startX; x < endX; x++) {
      const index = (y * width + x) << 2;
      if (data[index + 3] < 0x80) continue;
      const color = rgbToLab({ R: data[index], G: data[index + 1], B: data[index + 2] });
      let colorIndex = 0;
      let minDiff = colorDiff(color, paletteColors[0]);
      for (let i = 1; i < paletteSize; i++) {
        const diff = colorDiff(color, paletteColors[i]);
        if (diff < minDiff) {
          colorIndex = i;
          minDiff = diff;
        }
      }
      pixels.push([imageX + x, imageY + y, colorIndex]);
    }
  return pixels;
}

export async function readImage(fileName: string, imageX: number, imageY: number, boardWidth: number, boardHeight: number, palette: Palette): Promise<Pixels> {
  const image = fs.createReadStream(fileName).pipe(new PNG);
  await once(image, "parsed");
  return toPixels(image, imageX, imageY, boardWidth, boardHeight, palette);
}
