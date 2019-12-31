import { once } from "events";
import * as fs from "fs";
import parseCSV = require("csv-parse");

export async function readUsers(fileName: string): Promise<Map<number, string>> {
  const sessions = new Map<number, string>();
  const parser = fs.createReadStream(fileName).pipe(parseCSV({
    cast(value, { column }) {
      switch (column) {
        case "uid":
          return parseInt(value, 10);
        default:
          return value;
      }
    },
    columns: ["uid", "clientId"],
    trim: true
  }));
  parser.on("readable", () => {
    let line: { uid: number; clientId: string; };
    while ((line = parser.read())) {
      const { uid, clientId } = line;
      if (sessions.has(uid)) throw new Error(`duplicate UID ${uid}`);
      sessions.set(uid, clientId);
    }
  });
  await once(parser, "end");
  return sessions;
}
