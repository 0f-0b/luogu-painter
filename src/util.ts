import timeout = require("timeout-signal");
import { once } from "events";
import * as fs from "fs";
import fetch, { RequestInfo, RequestInit } from "node-fetch";
import { PNG } from "pngjs";
import { Pixel } from ".";
import ditherImage = require("dither-image");

export function stringifyCount(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function count<T, It extends Iterable<T>>(obj: It, predicate: (value: T, index: number, obj: It) => unknown): number {
  let count = 0;
  let index = 0;
  for (const elem of obj)
    if (predicate(elem, index++, obj))
      count++;
  return count;
}

export function findNextIndex<T>(arr: readonly T[], begin: number, predicate: (value: T, index: number, obj: readonly T[]) => unknown): number {
  for (let i = begin, len = arr.length; i < len; i++)
    if (predicate(arr[i], i, arr))
      return i;
  for (let i = 0; i < begin; i++)
    if (predicate(arr[i], i, arr))
      return i;
  return -1;
}

export async function fetchTextWithTimeout(url: RequestInfo, ms: number, init?: RequestInit): Promise<string> {
  const signal = timeout(ms);
  try {
    const res = await fetch(url, { ...init, signal });
    return await res.text();
  } finally {
    timeout.clear(signal);
  }
}

export async function fetchJsonWithTimeout(url: RequestInfo, ms: number, init?: RequestInit): Promise<unknown> {
  const signal = timeout(ms);
  try {
    const res = await fetch(url, { ...init, signal });
    return await res.json() as unknown;
  } finally {
    timeout.clear(signal);
  }
}

export async function readImage(fileName: string, imageX: number, imageY: number, boardWidth: number, boardHeight: number, palette: Uint8Array): Promise<Pixel[]> {
  const image = fs.createReadStream(fileName).pipe(new PNG);
  await once(image, "parsed");
  const { width, height, data } = image;
  const startX = Math.max(-imageX, 0);
  const startY = Math.max(-imageY, 0);
  const endX = Math.min(boardWidth - imageX, width);
  const endY = Math.min(boardHeight - imageY, height);
  const colors = ditherImage(width, height, data, palette);
  const pixels: Pixel[] = [];
  for (let y = startY; y < endY; y++)
    for (let x = startX; x < endX; x++) {
      const index = y * width + x;
      if (data[(index << 2) + 3] >= 0x80)
        pixels.push({ x: imageX + x, y: imageY + y, color: colors[index] });
    }
  return pixels;
}
