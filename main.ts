import { delay } from "https://deno.land/std@0.117.0/async/delay.ts";
import { joinToString } from "https://deno.land/std@0.117.0/collections/join_to_string.ts";
import { BufReader } from "https://deno.land/std@0.117.0/io/buffer.ts";
import {
  BitDepth,
  ColorType,
  decode as decodePNG,
} from "https://deno.land/x/pngs@0.1.1/mod.ts";
// @deno-types="https://cdn.esm.sh/v58/@types/yargs@17.0.7/index.d.ts"
import yargs from "https://deno.land/x/yargs@v17.3.0-deno/deno.ts";
import ditherImage from "https://esm.sh/dither-image@0.2.0";
import { withFile } from "./io.ts";
import type { Image, Pixel } from "./mod.ts";
import { PaintBoard, palette } from "./mod.ts";
import type { Session } from "./session.ts";
import { parseSessions } from "./session.ts";
import { count, findNextIndex, once, shuffle } from "./util.ts";

declare global {
  interface NumberConstructor {
    isInteger(value: unknown): value is number;
  }
}

const {
  "png-file": pngFile,
  "x": x,
  "y": y,
  "sessions": sessionsFile,
  "randomize": randomize,
  "cooldown": cooldown,
  "endpoint": endpoint,
  "socket": socket,
} = yargs(Deno.args)
  .usage("Usage: luogu-painter [options] <png-file> <x> <y>")
  .version(false)
  .option("sessions", {
    alias: "s",
    description: "file to read sessions from",
    type: "string",
  })
  .option("randomize", {
    alias: "r",
    description: "randomize the order of pixels",
    type: "boolean",
  })
  .option("cooldown", {
    alias: "t",
    description: "milliseconds to wait after drawing each pixel",
    type: "number",
    default: 30000,
  })
  .option("endpoint", {
    description: "url to the paint board",
    type: "string",
    hidden: true,
  })
  .option("socket", {
    description: "url to the websocket",
    type: "string",
    hidden: true,
  })
  .option("help", {
    alias: "h",
    description: "show this help message",
    type: "boolean",
  })
  .command("$0 <png-file> <x> <y>", false, (yargs) =>
    yargs
      .positional("png-file", {
        description: "image to draw",
        type: "string",
        normalize: true,
      })
      .positional("x", {
        description: "x coordinate in pixels",
        type: "number",
      })
      .positional("y", {
        description: "y coordinate in pixels",
        type: "number",
      }))
  .fail((msg, err) => {
    if (err) {
      throw err;
    }
    console.error(msg);
    console.error("Try --help for more information.");
    Deno.exit(2);
  })
  .strict()
  .parseSync();
if (typeof pngFile !== "string") {
  throw new TypeError("png-file is not a string.");
}
if (!Number.isInteger(x)) {
  throw new TypeError("x is not an integer.");
}
if (!Number.isInteger(y)) {
  throw new TypeError("y is not an integer.");
}
const { width, height, data } = await Deno.readFile(pngFile).then((data) => {
  const { width, height, image, colorType, bitDepth } = decodePNG(data);
  if (colorType !== ColorType.RGBA) {
    throw new Error(`Unsupported color type ${colorType}`);
  }
  if (bitDepth !== BitDepth.Eight) {
    throw new Error(`Unsupported bit depth ${bitDepth}`);
  }
  return { width, height, data: image };
});
const sessions = sessionsFile === undefined
  ? []
  : await withFile(sessionsFile, (file) => parseSessions(new BufReader(file)));
const board = new PaintBoard(endpoint, socket);
const sessionCount = sessions.length;
if (sessionCount === 0) {
  console.log("No sessions given; starting in watch mode");
} else {
  console.log(
    `Using ${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}: ${
      joinToString(
        sessions,
        (session) => String(session.uid),
        { separator: ", " },
      )
    }`,
  );
}
const { width: boardWidth, height: boardHeight } =
  (await once(board, "load") as CustomEvent<Image>).detail;
console.log(`Board loaded (${boardWidth}x${boardHeight})`);
const startX = Math.max(-x, 0);
const startY = Math.max(-y, 0);
const endX = Math.min(boardWidth - x, width);
const endY = Math.min(boardHeight - y, height);
const colors = ditherImage(width, height, data, palette);
const pixels: Pixel[] = [];
for (let dy = startY; dy < endY; dy++) {
  for (let dx = startX; dx < endX; dx++) {
    const index = dy * width + dx;
    if (data[(index << 2) + 3] >= 0x80) {
      pixels.push({ x: x + dx, y: y + dy, color: colors[index] });
    }
  }
}
if (randomize) {
  shuffle(pixels);
}
const pixelCount = pixels.length;
console.log(`${pixelCount} ${pixelCount === 1 ? "pixel" : "pixels"} in total`);
const needPaint = ({ x, y, color }: Pixel) => board.get(x, y) !== color;
let cur = 0;

async function openSession(session: Session): Promise<never> {
  console.log(session.uid, "Session opened");
  for (;;) {
    const next = findNextIndex(pixels, cur, needPaint);
    cur = next + 1;
    if (next !== -1) {
      const { x, y, color } = pixels[next];
      await board.set(x, y, color, session);
      console.log(session.uid, `(${x}, ${y}) ← ${color}`);
    }
    await delay(cooldown);
  }
}

function logCount(count: number): void {
  console.log(`${count} ${count === 1 ? "pixel" : "pixels"} remaining`);
}

let last = count(pixels, needPaint);
logCount(last);
board.addEventListener("update", () => {
  const cur = count(pixels, needPaint);
  if (cur === last) {
    return;
  }
  logCount(last = cur);
});
for (const session of sessions) {
  openSession(session)
    .catch((error) => console.error(session.uid, error));
  await delay(cooldown / sessionCount);
}
