#!/usr/bin/env node

import * as program from "commander";
import { once } from "events";
import { knuthShuffle } from "knuth-shuffle";
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
  .usage("[options] <PNG image file> <y> <x>")
  .option("-s, --sessions <file>", "sessions file")
  .option("-r, --randomize", "randomize the order of pixels")
  .option("-t, --cooldown <time>", "cooldown time in milliseconds", integer, 30000)
  .option("--endpoint <url>", "url to the paint board", "https://www.luogu.com.cn/paintBoard")
  .option("--socket <url>", "url to the websocket", "wss://ws.luogu.com.cn/ws")
  .parse(process.argv);
const [imageFile, y, x] = program.args;
if (!(imageFile && y && x))
  program.help();
const { sessions: sessionsFile, randomize, cooldown, endpoint, socket } = program.opts() as {
  sessions?: string;
  randomize?: true;
  cooldown: number;
  endpoint: string;
  socket: string;
};

(async () => {
  const imageX = integer(x);
  const imageY = integer(y);
  const sessions = sessionsFile === undefined ? [] : await readSessions(sessionsFile);
  const sessionCount = sessions.length;
  if (sessionCount)
    console.log(`Using ${stringifyCount(sessionCount, "session", "sessions")}: ${sessions.map(session => session.uid).join(", ")}`);
  else
    console.log("No sessions given; starting in watch mode");
  const board = new PaintBoard(endpoint, socket);
  const [width, height] = await once(board, "load") as [number, number];
  console.log(`Board loaded (${width}x${height})`);
  const pixels = await readImage(imageFile, imageX, imageY, width, height, palette);
  if (randomize)
    knuthShuffle(pixels);
  const pixelCount = pixels.length;
  console.log(`${stringifyCount(pixelCount, "pixel", "pixels")} in total`);
  const delayTime = cooldown / sessionCount;
  let cur = 0;

  function needPaint({ y, x, color }: Pixel): boolean {
    return board.get(y, x) !== color;
  }

  async function openSession(session: Session): Promise<never> {
    console.log(session.uid, "Session opened");
    for (; ;) {
      const next = findNextIndex(pixels, cur, needPaint);
      cur = next + 1;
      if (next !== -1) {
        const { y, x, color } = pixels[next];
        await board.set(y, x, color, session);
        console.log(session.uid, `(${y}, ${x}) ← ${color}`);
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
    openSession(session).catch(error => console.error(session.uid, error));
    await delay(delayTime);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
