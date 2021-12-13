import {
  BitDepth,
  ColorType,
  decode as decodePNG,
  encode as encodePNG,
} from "https://deno.land/x/pngs@0.1.1/mod.ts";
// @deno-types="https://cdn.esm.sh/v58/@types/yargs@17.0.7/index.d.ts"
import yargs from "https://deno.land/x/yargs@v17.3.0-deno/deno.ts";
import type { Image, Pixel } from "./mod.ts";
import {
  defaultPalette,
  LuoguPainter,
  PaintBoardError,
  parseTokens,
} from "./mod.ts";
import { pluralize, throttleAsync } from "./util.ts";

declare global {
  interface NumberConstructor {
    isInteger(value: unknown): value is number;
  }
}

const {
  "png": pngFile,
  "x": x,
  "y": y,
  "tokens": tokensFile,
  "randomize": randomize,
  "cooldown": cooldown,
  "preview": preview,
  "endpoint": endpoint,
  "socket": socket,
} = yargs(Deno.args)
  .usage("Usage: luogu-painter [options] <png> <x> <y>")
  .version(false)
  .option("tokens", {
    alias: "s",
    description: "file to read tokens from",
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
  throw new TypeError("png is not a string.");
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
const tokens = tokensFile === undefined
  ? []
  : parseTokens(await Deno.readTextFile(tokensFile));
if (tokens.length === 0) {
  console.log("No tokens; starting in watch mode");
} else {
  console.log(`Using ${pluralize(tokens.length, "token", "tokens")}`);
}
const painter = new LuoguPainter({
  image: { x, y, width, height, data },
  tokens,
  randomize,
  cooldown,
  endpoint,
  socket,
});
let boardCache: Image;
let pixelsCache: Pixel[];

const savePreview = throttleAsync(60000, async (path: string) => {
  console.log("Saving preview");
  try {
    const { data, width, height } = boardCache;
    const previewData = new Uint8Array(data);
    for (const { x, y, color } of pixelsCache) {
      previewData[y * width + x] = color;
    }
    await Deno.writeFile(
      path,
      encodePNG(previewData, width, height, {
        palette: defaultPalette,
        color: ColorType.Indexed,
      }),
    );
  } catch (e: unknown) {
    console.error("Failed to save preview:", e);
  }
});

let lastCount = -1;

function update(count: number): void {
  if (count !== lastCount) {
    lastCount = count;
    console.log(`${pluralize(count, "pixel", "pixels")} remaining`);
  }
  if (preview !== undefined) {
    savePreview(preview);
  }
}

painter.addEventListener("load", (event) => {
  const { board, pixels, remaining } = event.detail;
  boardCache = board;
  pixelsCache = pixels;
  console.log(`Board loaded (${board.width}x${board.height})`);
  console.log(`${pluralize(pixels.length, "pixel", "pixels")} in total`);
  update(remaining);
});
painter.addEventListener("update", (event) => {
  const { pixel: { x, y, color }, remaining } = event.detail;
  const { data, width } = boardCache;
  data[y * width + x] = color;
  update(remaining);
});
painter.addEventListener("paint", (event) => {
  const { x, y, color } = event.detail;
  console.log(`(${x}, ${y}) ← ${color}`);
});
painter.addEventListener("error", (event) => {
  const error = event.detail;
  if (error instanceof PaintBoardError) {
    console.error(`${error.token}: ${error.message}`);
  } else {
    console.error("Error drawing pixel:", error);
  }
});
