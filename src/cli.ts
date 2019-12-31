#!/usr/bin/env node

import * as commander from "commander";
import { once } from "events";
import * as fs from "fs";
import { PNG } from "pngjs";
import { PaintBoard } from ".";
import { readUsers } from "./users";
import { autoRetry, delay, findNextIndex, toPixels } from "./util";
import { description, name, version } from "./version";

function integer(value: string): number {
  if (!/^\d+$/.test(value)) throw new TypeError(value + " is not an integer");
  return parseInt(value, 10);
}

commander
  .name(name)
  .version(version)
  .description(description)
  .usage("[options] <PNG image>")
  .requiredOption("-u, --users <file>", "users file providing session IDs")
  .requiredOption("-x, --image-x <x>", "image X coordinate in pixels", integer)
  .requiredOption("-y, --image-y <y>", "image Y coordinate in pixels", integer)
  .option("-w, --board-width <width>", "board width in pixels", integer, 800)
  .option("-h, --board-height <height>", "board height in pixels", integer, 400)
  .parse(process.argv);
const [fileName] = commander.args;
if (!fileName) commander.help();
const {
  imageX,
  imageY,
  boardWidth,
  boardHeight,
  users: usersFileName
} = commander.opts() as {
  imageX: number;
  imageY: number;
  boardWidth: number;
  boardHeight: number;
  users: string;
};

async function readImage(fileName: string): Promise<[number, number, number][]> {
  const image = fs.createReadStream(fileName).pipe(new PNG);
  await once(image, "parsed");
  return await toPixels(image, imageX, imageY, boardWidth, boardHeight);
}

(async () => {
  const users = await readUsers(usersFileName);
  if (!users.size) throw new Error("users file is empty");
  const pixels = await readImage(fileName);
  const board = new PaintBoard;
  await once(board, "load");
  let cur = 0;

  function needPaint([x, y, color]: [number, number, number]): boolean {
    return board.get(x, y) !== color;
  }

  async function openSession(uid: number, clientId: string): Promise<never> {
    process.stdout.write(`[${uid}] opening session\n`);
    for (; ;) {
      const next = findNextIndex(pixels, cur, needPaint);
      if (next !== -1) {
        const [x, y, color] = pixels[next];
        await autoRetry(() => board.set(x, y, color, uid, clientId));
        process.stdout.write(`[${uid}] set ${x},${y} to ${color}\n`);
        cur = next + 1;
      }
      await delay(10000);
    }
  }

  for (const [uid, clientId] of users) {
    openSession(uid, clientId);
    await delay(1000);
  }
})().catch(error => {
  process.stderr.write(`unexpected error: ${error && error.stack ? error.stack : error}\n`);
  process.exit(1);
});
