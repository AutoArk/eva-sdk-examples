import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const rootRelativeAsset = html.match(/(?:src|href)=(['"])\/assets\//);

if (rootRelativeAsset) {
  throw new Error(
    "dist/index.html contains a root-relative /assets/ URL; static subpath deployment would return 404",
  );
}

if (!html.includes("./assets/")) {
  throw new Error("dist/index.html does not contain relative ./assets/ URLs");
}

console.log("electron demo dist uses subpath-safe relative asset URLs");
