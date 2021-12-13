export type ArrayConvertible<T> = Iterable<T> | ArrayLike<T>;
export type Awaitable<T> = T | PromiseLike<T>;
export type EventListener<T, E extends Event> =
  | ((this: T, event: E) => void | Promise<void>)
  | { handleEvent(event: E): void | Promise<void> };

export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
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

export function throttleAsync<T, P extends unknown[], R>(
  delay: number,
  fn: (this: T, ...args: P) => Awaitable<R>,
): (this: T, ...args: P) => Promise<R> {
  let id: number | undefined;
  let lastTime = -Infinity;
  let lastResult: R;
  return async function (this: T, ...args: P): Promise<R> {
    const run = async () => {
      lastTime = Infinity;
      try {
        lastResult = await fn.apply(this, args);
      } finally {
        lastTime = performance.now();
      }
    };
    clearTimeout(id);
    const remaining = lastTime + delay - performance.now();
    if (remaining <= 0) {
      await run();
    } else {
      id = setTimeout(run, remaining);
    }
    return lastResult;
  };
}
