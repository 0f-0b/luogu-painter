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
  .usage("[options] <users file> <PNG image>")
  .requiredOption("-x, --image-x <x>", "image X coordinate in pixels", integer)
  .requiredOption("-y, --image-y <y>", "image Y coordinate in pixels", integer)
  .option("-r, --randomize", "randomize the order of pixels")
  .option("-t, --cooldown-time", "cooldown time in ms", integer, 10000)
  .parse(process.argv);
const [usersFileName, imageFileName] = commander.args;
if (!(usersFileName && imageFileName)) commander.help();
const {
  imageX,
  imageY,
  randomize,
  cooldownTime
} = commander.opts() as {
  imageX: number;
  imageY: number;
  randomize?: true;
  cooldownTime: number;
};

(async () => {
  const users = await readUsers(usersFileName);
  if (!users.size) throw new Error("users file is empty");
  const board = new PaintBoard;
  await once(board, "load");
  const { width, height } = board;
  process.stdout.write(`board loaded: ${width}x${height}\n`);
  const pixels = await readImage(imageFileName, imageX, imageY, width, height);
  if (randomize) shuffle(pixels);
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
        let count = 0;
        for (const pixel of pixels)
          if (needPaint(pixel)) count++;
        process.stdout.write(`${uid}: (${x}, ${y}) = ${color}, ${count} pixels left\n`);
      }
      await delay(cooldownTime);
    }
  }

  for (const [uid, clientId] of users)
    openSession(uid, clientId);
})().catch(error => {
  process.stderr.write(`unexpected error: ${error?.stack ?? error}\n`);
  process.exit(1);
});
