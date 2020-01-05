import { once } from "events";
import * as fs from "fs";
import { Session } from ".";
import parseCSV = require("csv-parse");

export async function readSessions(fileName: string): Promise<Session[]> {
  const sessions: Session[] = [];
  const uids = new Set<number>();
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
    let line: Session;
    while ((line = parser.read())) {
      const uid = line.uid;
      if (uids.has(uid)) throw new Error(`duplicate UID ${uid}`);
      sessions.push(line);
      uids.add(uid);
    }
  });
  await once(parser, "end");
  return sessions;
}
