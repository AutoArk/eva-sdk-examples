import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const scripts = dirname(fileURLToPath(import.meta.url));
const launcher = join(scripts, "run-with-key-file.mjs");
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
  try {
    const result = await run(node, [launcher, keyFile, node, child, String(exitCode)], {
      env: { ...process.env, UNKNOWN: "parent-value" },
      maxBuffer: 1024 * 1024,
    });
    return { ...result, status: 0 };
  } catch (error) {
    return { stdout: error.stdout ?? "", stderr: error.stderr ?? "", status: error.code };
  }
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
]) {
  test(`${name} is rejected`, async () => {
    const { child } = await fixture();
    const result = await launch(contents, child);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /exactly one valid EVA_GATEWAY_API_KEY/);
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
  assert.match(result.stderr, /local SDK must be public candidate version 0\.1\.0/);
  assert.equal(await readFile(join(scripts, "../CMakeLists.txt"), "utf8"), cmakeBefore);
});
