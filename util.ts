import { delay } from "https://deno.land/std@0.117.0/async/delay.ts";

export type Awaitable<T> = T | PromiseLike<T>;
export type EventListener<T, E extends Event> =
  | ((this: T, event: E) => void | Promise<void>)
  | { handleEvent(event: E): void | Promise<void> };

export function once(target: EventTarget, event: string): Promise<Event> {
  return new Promise((resolve) =>
    target.addEventListener(event, resolve, { once: true })
  );
}

export interface RetryOptions {
  retries?: number;
  interval?: number;
}

export async function retry<T>(
  fn: () => Awaitable<T>,
  { retries = 10, interval = 2000 }: RetryOptions = {},
): Promise<T> {
  const errors: unknown[] = [];
  do {
    try {
      return await fn();
    } catch (e: unknown) {
      errors.push(e);
    }
    await delay(interval);
    interval *= 2;
  } while (retries-- > 0);
  throw new AggregateError(errors);
}

export function timeout<T>(
  ms: number,
  fn: (signal: AbortSignal) => PromiseLike<T>,
): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return new Promise<T>((resolve) => resolve(fn(controller.signal)))
    .finally(() => clearTimeout(id));
}

export function count<T>(it: Iterable<T>, pred: (value: T) => unknown): number {
  let count = 0;
  for (const elem of it) {
    if (pred(elem)) {
      count++;
    }
  }
  return count;
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[j];
    arr[j] = arr[i];
    arr[i] = tmp;
  }
  return arr;
}

export function findNextIndex<T>(
  arr: readonly T[],
  index: number,
  pred: (value: T, index: number, arr: readonly T[]) => unknown,
): number {
  for (let i = index, len = arr.length; i < len; i++) {
    if (pred(arr[i], i, arr)) {
      return i;
    }
  }
  for (let i = 0; i < index; i++) {
    if (pred(arr[i], i, arr)) {
      return i;
    }
  }
  return -1;
}
