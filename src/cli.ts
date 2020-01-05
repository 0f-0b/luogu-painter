#!/usr/bin/env node

import * as commander from "commander";
import { once } from "events";
import { PaintBoard } from ".";
import { readUsers } from "./users";
import { autoRetry, delay, findNextIndex, readImage, shuffle } from "./util";
import { description, name, version } from "./version";

function integer(value: string): number {
  if (!/^\d+$/.test(value)) throw new TypeError(value + " is not an integer");
  return parseInt(value, 10);
}

commander
  .name(name)
  .version(version)
  .description(description)
  .usage("[options] <users file> <PNG image file> <x> <y>")
  .option("-r, --randomize", "randomize the order of pixels")
  .option("-t, --cooldown-time <time>", "cooldown time in ms", integer, 10000)
  .parse(process.argv);
const [usersFile, imageFile, x, y] = commander.args;
if (!(usersFile && imageFile)) commander.help();
const imageX = integer(x);
const imageY = integer(y);
const {
  randomize,
  cooldownTime
} = commander.opts() as {
  randomize?: true;
  cooldownTime: number;
};

(async () => {
  const users = await readUsers(usersFile);
  if (!users.size) throw new Error("users file is empty");
  const board = new PaintBoard;
  await once(board, "load");
  const { width, height } = board;
  process.stdout.write(`board: loaded ${width}x${height}\n`);
  board.on("reconnect", reason => process.stderr.write(`board: reconnecting (${reason})\n`));
  const pixels = await readImage(imageFile, imageX, imageY, width, height);
  if (randomize) shuffle(pixels);
  const delayTime = cooldownTime / users.size;
  let cur = 0;

  function needPaint([x, y, color]: [number, number, number]): boolean {
    return board.get(x, y) !== color;
  }

  async function openSession(uid: number, clientId: string): Promise<never> {
    process.stdout.write(`${uid}: session opened\n`);
    for (; ;) {
      const next = findNextIndex(pixels, cur, needPaint);
      cur = next + 1;
      if (next !== -1) {
        const [x, y, color] = pixels[next];
        await autoRetry(() => board.set(x, y, color, uid, clientId));
        process.stdout.write(`${uid}: (${x}, ${y}) = ${color}\n`);
      }
      await delay(cooldownTime);
    }
  }

  function countRemaining(): number {
    let count = 0;
    for (const pixel of pixels)
      if (needPaint(pixel)) count++;
    return count;
  }

  function printCount(count: number): void {
    process.stdout.write(`${count} ${count === 1 ? "pixel" : "pixels"} left\n`);
  }

  let last = countRemaining();
  printCount(last);
  board.on("update", () => {
    const count = countRemaining();
    if (count === last) return;
    printCount(last = count);
  });
  for (const [uid, clientId] of users) {
    openSession(uid, clientId);
    await delay(delayTime);
  }
})().catch(error => {
  process.stderr.write(`unexpected error: ${error?.stack ?? error}\n`);
  process.exit(1);
});
