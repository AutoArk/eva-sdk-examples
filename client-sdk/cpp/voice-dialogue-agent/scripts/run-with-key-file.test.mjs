import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PassThrough } from "node:stream";
import { launch as launchProcess, parseKeyFile } from "./run-with-key-file.mjs";

const run = promisify(execFile);
const scripts = dirname(fileURLToPath(import.meta.url));
const localSdk = join(scripts, "use-local-sdk.mjs");
const node = process.execPath;
const secret = "synthetic-secret-123";
const temporaryRoots = [];
after(async () => { await Promise.all(temporaryRoots.map(root => rm(root, {recursive: true, force: true}))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "eva-example-launcher-"));
  temporaryRoots.push(root);
  const child = join(root, "fake-child.mjs");
  await writeFile(child, `
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  process.stdout.write("OUT:" + input.slice(0, 5));
  process.stderr.write("ERR:" + input.slice(0, 4));
  setTimeout(() => {
    process.stdout.write(input.slice(5) + " UNKNOWN=" + (process.env.UNKNOWN ?? "") + "\\n");
    process.stderr.write(input.slice(4).trim() + "\\n");
    process.exit(Number(process.argv[2] ?? 0));
  }, 5);
});
`);
  return { root, child };
}

async function launch(key, child, exitCode = 0) {
  const keyFile = join(dirname(child), "key.env");
  await writeFile(keyFile, key);
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let stdoutText = "";
  let stderrText = "";
  stdout.on("data", chunk => { stdoutText += chunk; });
  stderr.on("data", chunk => { stderrText += chunk; });
  const result = await launchProcess({
    keyFile,
    executable: node,
    args: [child, String(exitCode)],
    parentEnvironment: { ...process.env, UNKNOWN: "parent-value" },
    stdout,
    stderr,
  });
  return { stdout: stdoutText, stderr: stderrText, status: result.code };
}

test("redacts split stdout/stderr and excludes unknown variables", async () => {
  const { root, child } = await fixture();
  const result = await launch(`EVA_GATEWAY_API_KEY='${secret}'\nUNKNOWN=from-key\n`, child);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
  assert.match(result.stdout, /\[REDACTED\]/);
  assert.match(result.stderr, /\[REDACTED\]/);
  assert.match(result.stdout, /UNKNOWN=\s/);
  await access(root);
});

for (const [name, contents] of [
  ["missing key", "UNKNOWN=only-unknown\n"],
  ["duplicate key", "EVA_GATEWAY_API_KEY=one\nEVA_GATEWAY_API_KEY=two\n"],
  ["unquoted whitespace", "EVA_GATEWAY_API_KEY=one two\n"],
  ["mismatched quotes", "EVA_GATEWAY_API_KEY='one\n"],
]) {
  test(`${name} is rejected`, () => {
    assert.throws(() => parseKeyFile(contents));
  });
}

test("preserves a nonzero child exit", async () => {
  const { child } = await fixture();
  const result = await launch(`EVA_GATEWAY_API_KEY=${secret}\n`, child, 7);
  assert.equal(result.status, 7);
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
});

test("rejects a mismatched local SDK before CMake", async () => {
  const { root } = await fixture();
  const candidate = join(root, "candidate");
  await mkdir(candidate);
  await writeFile(join(candidate, "manifest.json"), JSON.stringify({ sdkVersion: "9.9.9", profile: "private" }));
  const cmakeBefore = await readFile(join(scripts, "../CMakeLists.txt"), "utf8");
  const result = await run(node, [localSdk, candidate], { env: { ...process.env, CMAKE: "/bin/false" } }).then(
    () => ({ status: 0, stderr: "" }),
    error => ({ status: error.code, stderr: error.stderr ?? "" }),
  );
  assert.equal(result.status, 1);
  const {sdkVersion} = await import('./sdk-version.mjs');
  assert.ok(result.stderr.includes(`local SDK must be public candidate version ${sdkVersion()}`));
  assert.equal(await readFile(join(scripts, "../CMakeLists.txt"), "utf8"), cmakeBefore);
});
