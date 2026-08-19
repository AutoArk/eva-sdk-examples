#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsPackage = "@autoark-ai/eva-client-sdk-ts";
const pythonPackage = "autoark-eva-client-sdk";
const flutterPackage = "autoark_eva_client_sdk";
const catalog = JSON.parse(await readFile(join(root, "examples.json"), "utf8"));
const options = parseArgs(process.argv.slice(2));
const touched = new Map();

if (options.ts === undefined && options.python === undefined && options.flutter === undefined) {
  fail("usage: update-sdk-versions.mjs [--ts <version>] [--python <version>] [--flutter <version>]");
}

for (const [name, version] of Object.entries(options)) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`${name} version must be an exact registry version: ${version}`);
  }
}

try {
  if (options.ts !== undefined) {
    for (const example of matchingExamples("npm", tsPackage)) {
      const directory = join(root, example.path);
      await remember(join(directory, "package.json"));
      await remember(join(directory, "package-lock.json"));
      run(
        "npm",
        [
          "install",
          "--save-exact",
          "--package-lock-only",
          "--ignore-scripts",
          `${tsPackage}@${options.ts}`,
        ],
        directory,
      );
    }
  }

  if (options.python !== undefined) {
    for (const example of matchingExamples("pypi", pythonPackage)) {
      const directory = join(root, example.path);
      const projectPath = join(directory, "pyproject.toml");
      await remember(projectPath);
      await remember(join(directory, "uv.lock"));
      const project = await readFile(projectPath, "utf8");
      const dependency = new RegExp(
        `(${pythonPackage.replaceAll("-", "\\-")}\\[[^\\]]+\\]==)[^\"]+`,
      );
      if (!dependency.test(project)) throw new Error(`cannot find exact ${pythonPackage} dependency`);
      await writeFile(
        projectPath,
        project.replace(dependency, (_match, prefix) => `${prefix}${options.python}`),
      );
      run("uv", ["lock", "--upgrade-package", pythonPackage], directory);
    }
  }

  if (options.flutter !== undefined) {
    for (const example of matchingExamples("pub", flutterPackage)) {
      const directory = join(root, example.path);
      const manifestPath = join(directory, "pubspec.yaml");
      await remember(manifestPath);
      await remember(join(directory, "pubspec.lock"));
      const manifest = await readFile(manifestPath, "utf8");
      const dependency = new RegExp(`(${flutterPackage}: )\\S+`);
      if (!dependency.test(manifest)) {
        throw new Error(`cannot find exact ${flutterPackage} dependency`);
      }
      await writeFile(
        manifestPath,
        manifest.replace(dependency, (_match, prefix) => `${prefix}${options.flutter}`),
      );
      run("flutter", ["pub", "get"], directory);
    }
  }

  run("node", [join(root, "scripts/verify-catalog.mjs")], root);
} catch (error) {
  await restore();
  fail(`update failed; restored manifests and lockfiles\n${error.message}`);
}

console.log(
  `SDK versions updated: ${[
    options.ts && `TypeScript ${options.ts}`,
    options.python && `Python ${options.python}`,
    options.flutter && `Flutter ${options.flutter}`,
  ].filter(Boolean).join(", ")}`,
);

async function remember(path) {
  touched.set(path, await readFile(path));
}

async function restore() {
  await Promise.all([...touched].map(([path, contents]) => writeFile(path, contents)));
}

function matchingExamples(ecosystem, packageName) {
  const examples = catalog.examples.filter(
    (example) => example.sdk?.ecosystem === ecosystem && example.sdk?.package === packageName,
  );
  if (examples.length === 0) throw new Error(`no ${packageName} examples found in examples.json`);
  return examples;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--ts', '--python', '--flutter'].includes(key) || value === undefined) {
      fail(`unknown or incomplete argument: ${key ?? "<missing>"}`);
    }
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
