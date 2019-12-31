import { closest, RGBColor } from "color-diff";

export function findNextIndex<T>(arr: readonly T[], begin: number, predicate: (value: T, index: number, obj: readonly T[]) => unknown): number {
  for (let i = begin, len = arr.length; i < len; i++)
    if (predicate(arr[i], i, arr)) return i;
  for (let i = 0; i < begin; i++)
    if (predicate(arr[i], i, arr)) return i;
  return -1;
}

export function autoRetry<T>(func: () => Promise<T>): Promise<T> {
  return new Promise(function tryResolve(resolve) {
    func().then(resolve, () => setTimeout(tryResolve, 500, resolve));
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const palette: readonly Readonly<RGBColor>[] = [
  { R: 0, G: 0, B: 0 },
  { R: 255, G: 255, B: 255 },
  { R: 170, G: 170, B: 170 },
  { R: 85, G: 85, B: 85 },
  { R: 254, G: 211, B: 199 },
  { R: 255, G: 196, B: 206 },
  { R: 250, G: 172, B: 142 },
  { R: 255, G: 139, B: 131 },
  { R: 244, G: 67, B: 54 },
  { R: 233, G: 30, B: 99 },
  { R: 226, G: 102, B: 158 },
  { R: 156, G: 39, B: 176 },
  { R: 103, G: 58, B: 183 },
  { R: 63, G: 81, B: 181 },
  { R: 0, G: 70, B: 112 },
  { R: 5, G: 113, B: 151 },
  { R: 33, G: 150, B: 243 },
  { R: 0, G: 188, B: 212 },
  { R: 59, G: 229, B: 219 },
  { R: 151, G: 253, B: 220 },
  { R: 22, G: 115, B: 0 },
  { R: 55, G: 169, B: 60 },
  { R: 137, G: 230, B: 66 },
  { R: 215, G: 255, B: 7 },
  { R: 255, G: 246, B: 209 },
  { R: 248, G: 203, B: 140 },
  { R: 255, G: 235, B: 59 },
  { R: 255, G: 193, B: 7 },
  { R: 255, G: 152, B: 0 },
  { R: 255, G: 87, B: 34 },
  { R: 184, G: 63, B: 39 },
  { R: 121, G: 85, B: 72 }
];

export async function toPixels({ width, height, data }: { width: number; height: number; data: Uint8Array; },
  imageX: number, imageY: number, boardWidth: number, boardHeight: number): Promise<[number, number, number][]> {
  const startX = Math.max(-imageX, 0);
  const startY = Math.max(-imageY, 0);
  const endX = Math.min(boardWidth - imageX, width);
  const endY = Math.min(boardHeight - imageY, height);
  const pixels: [number, number, number][] = [];
  for (let y = startY; y < endY; y++)
    for (let x = startX; x < endX; x++) {
      const index = (y * width + x) << 2;
      if (data[index + 3] < 0.5) continue;
      const color = palette.indexOf(closest({
        R: data[index],
        G: data[index + 1],
        B: data[index + 2]
      }, palette));
      pixels.push([imageX + x, imageY + y, color]);
    }
  return pixels;
}
