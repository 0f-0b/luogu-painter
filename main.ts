import { joinToString } from "https://deno.land/std@0.117.0/collections/join_to_string.ts";
import {
  BitDepth,
  ColorType,
  decode as decodePNG,
  encode as encodePNG,
} from "https://deno.land/x/pngs@0.1.1/mod.ts";
// @deno-types="https://cdn.esm.sh/v58/@types/yargs@17.0.7/index.d.ts"
import yargs from "https://deno.land/x/yargs@v17.3.0-deno/deno.ts";
import { LuoguPainter, palette } from "./mod.ts";
import { readSessions } from "./session.ts";

declare global {
  interface NumberConstructor {
    isInteger(value: unknown): value is number;
  }
}

const {
  "png": pngFile,
  "x": x,
  "y": y,
  "sessions": sessionsFile,
  "randomize": randomize,
  "cooldown": cooldown,
  "preview": preview,
  "endpoint": endpoint,
  "socket": socket,
} = yargs(Deno.args)
  .usage("Usage: luogu-painter [options] <png> <x> <y>")
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
  })
  .option("preview", {
    alias: "p",
    description: "file to store a preview to",
    type: "string",
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
  .command("$0 <png> <x> <y>", false, (yargs) =>
    yargs
      .positional("png", {
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
  : await readSessions(sessionsFile);
if (sessions.length === 0) {
  console.log("No sessions; starting in watch mode");
} else {
  console.log(
    `Using ${sessions.length} ${
      sessions.length === 1 ? "session" : "sessions"
    }: ${
      joinToString(
        sessions,
        (session) => String(session.uid),
        { separator: ", " },
      )
    }`,
  );
}
const painter = new LuoguPainter({
  image: { x, y, width, height, data },
  sessions,
  randomize,
  cooldown,
  endpoint,
  socket,
});
painter.addEventListener("load", (event) => {
  const { board: { width, height, data }, pixels } = event.detail;
  console.log(`Board loaded (${width}x${height})`);
  const total = pixels.length;
  console.log(`${total} ${total === 1 ? "pixel" : "pixels"} in total`);
  if (preview !== undefined) {
    for (const { x, y, color } of pixels) {
      data[y * width + x] = color;
    }
    const png = encodePNG(data, width, height, {
      palette,
      color: ColorType.Indexed,
    });
    Deno.writeFile(preview, png)
      .catch((e: unknown) => console.error("Failed to save preview:", e));
  }
});
painter.addEventListener("update", (event) => {
  const { remaining } = event.detail;
  console.log(`${remaining} ${remaining === 1 ? "pixel" : "pixels"} remaining`);
});
painter.addEventListener("paint", (event) => {
  const { session, pixel: { x, y, color } } = event.detail;
  console.log(session.uid, `(${x}, ${y}) ← ${color}`);
});
painter.addEventListener("error", (event) => {
  const { session, error } = event.detail;
  console.log(session.uid, String(error));
});
