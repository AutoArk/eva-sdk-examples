#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseKeyFile } from "./run-flutter-demo-with-key-file.mjs";

export function parseBuildOptions(args) {
  let mode = "release";
  let keyFilePath;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--release") {
      mode = "release";
      continue;
    }
    if (argument === "--debug") {
      mode = "debug";
      continue;
    }
    if (argument === "--key-file") {
      keyFilePath = args[index + 1];
      if (keyFilePath === undefined) throw new Error("--key-file requires a path");
      index += 1;
      continue;
    }
    throw new Error("unknown option: " + argument);
  }
  return { mode, keyFilePath };
}

export function createFlutterBuildArgs({ mode, definesPath }) {
  const args = ["build", "ios", `--${mode}`];
  if (definesPath !== undefined) args.push(`--dart-define-from-file=${definesPath}`);
  return args;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseBuildOptions(args);
  let tempRoot;
  try {
    let definesPath;
    if (options.keyFilePath !== undefined) {
      const values = parseKeyFile(await readFile(resolve(options.keyFilePath), "utf8"));
      tempRoot = await mkdtemp(join(tmpdir(), "eva-flutter-ios-build-"));
      definesPath = join(tempRoot, "defines.json");
      await writeFile(definesPath, JSON.stringify(values), { encoding: "utf8", mode: 0o600 });
      console.log("Building iOS app with a test-only Gateway AK (value hidden).");
    } else {
      console.log("Building iOS app without a bundled Gateway AK; the app will request one at runtime.");
    }

    const flutterArgs = createFlutterBuildArgs({ mode: options.mode, definesPath });
    const result = spawnSync("flutter", flutterArgs, { cwd: process.cwd(), stdio: "inherit" });
    if (result.error !== undefined) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    if (tempRoot !== undefined) await rm(tempRoot, { recursive: true, force: true });
  }
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("iOS demo build failed: " + message);
    process.exitCode = 1;
  }
}
