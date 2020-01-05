#!/usr/bin/env node

import * as commander from "commander";
import { once } from "events";
import { PaintBoard, palette, Session } from ".";
import { readSessions } from "./sessions";
import { autoRetry, delay, findNextIndex, readImage, shuffle } from "./util";
import { description, name, version } from "./version";

function integer(value: string): number {
  if (!/^\d+$/.test(value)) throw new TypeError(`'${value}' is not an integer`);
  return parseInt(value, 10);
}

commander
  .name(name)
  .version(version)
  .description(description)
  .usage("[options] <PNG image file> <x> <y>")
  .option("-s, --sessions <file>", "sessions file")
  .option("-r, --randomize", "randomize the order of pixels")
  .option("-t, --cooldown <time>", "cooldown time in ms", integer, 10000)
  .parse(process.argv);
const [imageFile, x, y] = commander.args;
if (!(imageFile && x && y)) commander.help();
const imageX = integer(x);
const imageY = integer(y);
const {
  sessions: sessionsFile,
  randomize,
  cooldown
} = commander.opts() as {
  sessions?: string;
  randomize?: true;
  cooldown: number;
};

(async () => {
  const sessions = sessionsFile ? await readSessions(sessionsFile) : [];
  const sessionCount = sessions.length;
  if (sessionCount) process.stderr.write(`using ${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}: ${sessions.map(session => session.uid).join(", ")}\n`);
  else process.stderr.write("no sessions given, starting in watch mode\n");
  const board = new PaintBoard;
  await once(board, "load");
  const { width, height } = board;
  process.stderr.write(`loaded board (${width}x${height})\n`);
  board.on("reconnect", reason => process.stderr.write(`reconnecting to board: ${reason}\n`));
  const pixels = await readImage(imageFile, imageX, imageY, width, height, palette);
  if (randomize) shuffle(pixels);
  const pixelCount = pixels.length;
  process.stderr.write(`${pixelCount} ${pixelCount === 1 ? "pixel" : "pixels"} in total${randomize ? " (randomized)" : ""}\n`);
  const delayTime = cooldown / sessionCount;
  let cur = 0;

  function needPaint([x, y, color]: [number, number, number]): boolean {
    return board.get(x, y) !== color;
  }

  async function openSession(session: Session): Promise<never> {
    const uid = session.uid;
    process.stderr.write(`${uid}: session opened\n`);
    for (; ;) {
      const next = findNextIndex(pixels, cur, needPaint);
      cur = next + 1;
      if (next !== -1) {
        const [x, y, color] = pixels[next];
        await autoRetry(() => board.set(x, y, color, session), 5);
        process.stderr.write(`${uid}: (${x}, ${y}) = ${color}\n`);
      }
      await delay(cooldown);
    }
  }

  function countRemaining(): number {
    let count = 0;
    for (const pixel of pixels)
      if (needPaint(pixel)) count++;
    return count;
  }

  function printCount(count: number): void {
    process.stderr.write(`${count} ${count === 1 ? "pixel" : "pixels"} left\n`);
  }

  let last = countRemaining();
  printCount(last);
  board.on("update", () => {
    const count = countRemaining();
    if (count === last) return;
    printCount(last = count);
  });
  for (const session of sessions) {
    openSession(session).catch(error => process.stderr.write(`${session.uid}: unexpected error: ${error?.stack ?? error}\n`));
    await delay(delayTime);
  }
})().catch(error => {
  process.stderr.write(`unexpected error: ${error?.stack ?? error}\n`);
  process.exit(1);
});
