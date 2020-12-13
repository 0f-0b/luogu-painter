import fetch, { RequestInfo, RequestInit } from "node-fetch";

export async function fetchLuogu(url: RequestInfo, init?: RequestInit | undefined): Promise<unknown> {
  const res = await fetch(url, init);
  if (res.status >= 300)
    throw Object.assign(new Error(res.statusText), { status: res.status });
  const { status, data } = await res.json() as { status: number; data: unknown; };
  if (status >= 300)
    throw Object.assign(new Error(String(data)), { status });
  return data;
}
