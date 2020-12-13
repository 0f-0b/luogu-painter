import * as fs from "fs";
import * as path from "path";

const { name: packageName, version, description } =
  JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8")) as {
    name: string;
    version: string;
    description: string;
  };
const name = packageName.substring(packageName.lastIndexOf("/") + 1);
export { name, version, description };
