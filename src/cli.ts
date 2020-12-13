#!/usr/bin/env node

import * as program from "commander";
import { once } from "events";
import { knuthShuffle } from "knuth-shuffle";
import retry from "p-retry";
import { promisify } from "util";
import { PaintBoard, palette, Pixel, Session } from ".";
import { readSessions } from "./sessions";
import { count, findNextIndex, readImage, stringifyCount } from "./util";
import { description, name, version } from "./version";

const delay = promisify(setTimeout);

function integer(value: string): number {
  if (!/^\d+$/.test(value))
    throw new TypeError(`'${value}' is not an integer`);
  return parseInt(value, 10);
}

program
  .name(name)
  .version(version)
  .description(description)
  .usage("[options] <PNG image file> <x> <y>")
  .option("-s, --sessions <file>", "sessions file")
  .option("-r, --randomize", "randomize the order of pixels")
  .option("-t, --cooldown <time>", "cooldown time in ms", integer, 10000)
  .parse(process.argv);
const [imageFile, x, y] = program.args;
if (!(imageFile && x && y))
  program.help();
const imageX = integer(x);
const imageY = integer(y);
const { sessions: sessionsFile, randomize, cooldown } = program.opts() as {
  sessions?: string;
  randomize?: true;
  cooldown: number;
};

(async () => {
  const sessions = sessionsFile ? await readSessions(sessionsFile) : [];
  const sessionCount = sessions.length;
  if (sessionCount)
    console.log(`Using ${stringifyCount(sessionCount, "session", "sessions")}: ${sessions.map(session => session.uid).join(", ")}`);
  else
    console.log("No sessions given; starting in watch mode");
  const board = new PaintBoard;
  await once(board, "load");
  const { width, height } = board;
  console.log(`Board loaded (${width}x${height})`);
  const pixels = await readImage(imageFile, imageX, imageY, width, height, palette);
  if (randomize)
    knuthShuffle(pixels);
  const pixelCount = pixels.length;
  console.log(`${stringifyCount(pixelCount, "pixel", "pixels")} in total`);
  const delayTime = cooldown / sessionCount;
  let cur = 0;

  function needPaint({ x, y, color }: Pixel): boolean {
    return board.get(x, y) !== color;
  }

  async function openSession(session: Session): Promise<never> {
    console.log(session.uid, "Session opened");
    for (; ;) {
      const next = findNextIndex(pixels, cur, needPaint);
      cur = next + 1;
      if (next !== -1) {
        const { x, y, color } = pixels[next];
        await retry(() => board.set(x, y, color, session), { retries: 4 });
        console.log(session.uid, `(${x}, ${y}) = ${color}`);
      }
      await delay(cooldown);
    }
  }

  function printCount(count: number): void {
    console.log(`${stringifyCount(count, "pixel", "pixels")} left`);
  }

  let last = count(pixels, needPaint);
  printCount(last);
  board.on("update", () => {
    const cur = count(pixels, needPaint);
    if (cur === last)
      return;
    printCount(last = cur);
  });
  for (const session of sessions) {
    openSession(session).catch(error => console.error(session.uid, String(error)));
    await delay(delayTime);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
