import * as fs from "fs";
import * as path from "path";

const { name: packageName, version, description }: {
  name: string;
  version: string;
  description: string;
} = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json")).toString());
export const name = packageName.substring(packageName.lastIndexOf("/") + 1);
export { version, description };
