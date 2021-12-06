import { parse as parseCSV } from "https://deno.land/std@0.117.0/encoding/csv.ts";
import type { BufReader } from "https://deno.land/std@0.117.0/io/buffer.ts";

export interface Session {
  uid: number;
  clientId: string;
}

export function parseSessions(input: string | BufReader): Promise<Session[]> {
  const uids = new Set<number>();
  return parseCSV(input, {
    comment: "#",
    trimLeadingSpace: true,
    columns: [
      {
        name: "uid",
        parse(input) {
          if (!/^\d+$/.test(input)) {
            throw new TypeError("Invalid uid");
          }
          const uid = parseInt(input, 10);
          if (uids.has(uid)) {
            throw new Error(`Duplicate uid ${uid}`);
          }
          uids.add(uid);
          return uid;
        },
      },
      {
        name: "clientId",
        parse(input) {
          if (!/^[0-9a-f]{40}$/.test(input)) {
            throw new TypeError("Invalid clientId");
          }
          return input;
        },
      },
    ],
  }) as Promise<Session[]>;
}
