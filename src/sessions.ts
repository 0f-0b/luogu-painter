import * as csv from '@fast-csv/parse';
import * as fs from "fs";
import { Session } from ".";

interface RawSession {
  uid: string;
  clientId: string;
}

export function readSessions(fileName: string): Promise<Session[]> {
  return new Promise((resolve, reject) => {
    const sessions: Session[] = [];
    const uids = new Set<number>();
    fs.createReadStream(fileName)
      .pipe(csv.parse<RawSession, Session>({
        headers: ["uid", "clientId"],
        comment: "#",
        ignoreEmpty: true,
        discardUnmappedColumns: true,
        strictColumnHandling: true,
        trim: true
      }))
      .transform(({ uid, clientId }: RawSession): Session => {
        if (!/^\d+$/.test(uid))
          throw new TypeError("Invalid uid");
        if (!/^[0-9a-f]{40}$/.test(clientId))
          throw new TypeError("Invalid clientId");
        return {
          uid: parseInt(uid, 10),
          clientId
        };
      })
      .on("data", (session: Session) => {
        const uid = session.uid;
        if (uids.has(uid))
          throw new Error(`Duplicate uid ${uid}`);
        uids.add(uid);
        sessions.push(session);
      })
      .on("data-invalid", (row: RawSession | null, rowCount: number) => reject(new Error(`Invalid row #${rowCount}: ${JSON.stringify(row)}`)))
      .on("error", reject)
      .on("end", () => resolve(sessions));
  });
}
