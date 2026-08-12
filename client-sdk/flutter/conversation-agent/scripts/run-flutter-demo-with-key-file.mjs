#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const keyMappings = Object.freeze([
  Object.freeze({ source: "EVA_GATEWAY_API_KEY", target: "EVA_GATEWAY_API_KEY" }),
]);

export function parseKeyFile(contents, mappings = keyMappings) {
  if (typeof contents !== "string") throw new TypeError("key file contents must be UTF-8 text");
  const expected = new Set(mappings.map(({ source }) => source));
  const collected = new Map([...expected].map((name) => [name, []]));

  for (const rawLine of contents.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const assignment = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    const source = assignment?.[1];
    if (source === undefined || !expected.has(source)) continue;
    let value = assignment[2].trim();
    const first = value[0];
    const last = value.at(-1);
    if ((first === "\"" || first === "'") && last === first) {
      value = value.slice(1, -1);
    } else if (first === "\"" || first === "'" || last === "\"" || last === "'") {
      throw new Error(source + " has unmatched quotes");
    }
    if (value.length === 0 || /\s/.test(value)) {
      throw new Error(source + " must be a non-empty value without whitespace");
    }
    collected.get(source).push(value);
  }

  return Object.fromEntries(mappings.map(({ source, target }) => {
    const values = collected.get(source);
    if (values.length === 0) throw new Error("key file is missing " + source);
    if (values.length > 1) throw new Error("key file contains duplicate " + source + " entries");
    return [target, values[0]];
  }));
}

export function createFlutterArgs(definesPath, flutterArgs = []) {
  return ["run", `--dart-define-from-file=${definesPath}`, ...flutterArgs];
}

export async function main(args = process.argv.slice(2)) {
  const [keyFilePath, ...flutterArgs] = args;
  if (keyFilePath === undefined) {
    throw new Error("usage: node scripts/run-flutter-demo-with-key-file.mjs /path/to/key-file [flutter run options]");
  }

  const values = parseKeyFile(await readFile(resolve(keyFilePath), "utf8"));
  const tempRoot = await mkdtemp(join(tmpdir(), "eva-flutter-demo-"));
  const definesPath = join(tempRoot, "defines.json");
  try {
    await writeFile(definesPath, JSON.stringify(values), { encoding: "utf8", mode: 0o600 });
    console.log(`Starting demo with ${keyMappings.length} mapped key(s) from key file (values hidden).`);
    const result = spawnSync("flutter", createFlutterArgs(definesPath, flutterArgs), {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    if (result.error !== undefined) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Key-file launch failed: " + message);
    process.exitCode = 1;
  }
}
