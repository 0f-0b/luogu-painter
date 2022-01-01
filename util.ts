export type Awaitable<T> = T | PromiseLike<T>;
export type EventListener<T, E extends Event> =
  | ((this: T, event: E) => void | Promise<void>)
  | { handleEvent(event: E): void | Promise<void> };

export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
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
    } else if (Number.isFinite(remaining)) {
      id = setTimeout(run, remaining);
    }
    return lastResult;
  };
}
