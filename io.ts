import type { Awaitable } from "./util.ts";

export async function withFile<T>(
  path: string | URL,
  fn: (file: Deno.File) => Awaitable<T>,
  options?: Deno.OpenOptions,
): Promise<T> {
  const file = await Deno.open(path, options);
  try {
    return await fn(file);
  } finally {
    file.close();
  }
}
