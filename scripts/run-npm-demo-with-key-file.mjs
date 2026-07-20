#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const keyMappings = Object.freeze([
  Object.freeze({
    source: "EVA_GATEWAY_API_KEY",
    target: "VITE_EVA_API_KEY",
  }),
]);

export function parseKeyFile(contents, mappings = keyMappings) {
  if (typeof contents !== "string") {
    throw new TypeError("key file contents must be UTF-8 text");
  }
  validateMappings(mappings);

  const expectedSources = new Set(mappings.map((mapping) => mapping.source));
  const collectedValues = new Map(mappings.map((mapping) => [mapping.source, []]));
  const lines = contents.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const assignment = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    const source = assignment?.[1];
    if (source === undefined || !expectedSources.has(source)) continue;

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
    collectedValues.get(source).push(value);
  }

  const parsedValues = {};
  for (const mapping of mappings) {
    const values = collectedValues.get(mapping.source);
    if (values.length === 0) {
      throw new Error("key file is missing " + mapping.source);
    }
    if (values.length > 1) {
      throw new Error("key file contains duplicate " + mapping.source + " entries");
    }
    parsedValues[mapping.source] = values[0];
  }
  return parsedValues;
}

export function createRuntimeEnvironment(values, mappings = keyMappings, baseEnvironment = process.env) {
  validateMappings(mappings);
  const environment = { ...baseEnvironment };
  for (const mapping of mappings) {
    delete environment[mapping.source];
    environment[mapping.target] = values[mapping.source];
  }
  return environment;
}

export async function readKeyFile(keyFilePath, mappings = keyMappings) {
  const contents = await readFile(resolve(keyFilePath), "utf8");
  return parseKeyFile(contents, mappings);
}

export function createNpmDevArgs(viteArgs = []) {
  const npmArgs = ["run", "dev"];
  if (viteArgs.length > 0) npmArgs.push("--", ...viteArgs);
  return npmArgs;
}

export async function main(args = process.argv.slice(2)) {
  const [keyFilePath, ...viteArgs] = args;
  if (keyFilePath === undefined) {
    throw new Error("usage: npm run dev:key-file -- /path/to/key-file [vite options]");
  }

  const values = await readKeyFile(keyFilePath);
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const npmArgs = createNpmDevArgs(viteArgs);

  console.log("Starting demo with " + keyMappings.length + " mapped key(s) from key file (values hidden).");
  const result = spawnSync(npmCommand, npmArgs, {
    cwd: process.cwd(),
    env: createRuntimeEnvironment(values),
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  process.exitCode = result.status ?? 1;
}

function validateMappings(mappings) {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    throw new TypeError("key mappings must be a non-empty array");
  }
  const sources = new Set();
  const targets = new Set();
  for (const mapping of mappings) {
    if (
      typeof mapping?.source !== "string"
      || typeof mapping.target !== "string"
      || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(mapping.source)
      || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(mapping.target)
    ) {
      throw new TypeError("key mappings must contain valid source and target environment variable names");
    }
    if (sources.has(mapping.source) || targets.has(mapping.target)) {
      throw new Error("key mappings must use unique source and target names");
    }
    sources.add(mapping.source);
    targets.add(mapping.target);
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
