import { access, readFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(join(root, "examples.json"), "utf8"));
const license = await readFile(join(root, "LICENSE"), "utf8");
const repositoryReadme = await readFile(join(root, "README.md"), "utf8");
const npmKeyFileLauncher = "node ../../../scripts/run-npm-demo-with-key-file.mjs";

await Promise.all([
  access(join(root, "scripts/run-npm-demo-with-key-file.mjs")),
  access(join(root, "scripts/run-npm-demo-with-key-file.test.mjs")),
]);

assert(catalog.schemaVersion === 1, "examples.json schemaVersion must be 1");
assert(Array.isArray(catalog.examples) && catalog.examples.length > 0, "catalog must contain examples");
assert(/^MIT License\r?\n/.test(license), "repository LICENSE must remain MIT");
assert(license.includes("Copyright (c) 2026 AutoArk AI"), "repository LICENSE owner drifted");

const ids = new Set();
const paths = new Set();

for (const example of catalog.examples) {
  assert(typeof example.id === "string" && example.id.length > 0, "example id is required");
  assert(typeof example.title === "string" && example.title.length > 0, `${example.id}: title is required`);
  assert(!ids.has(example.id), `duplicate example id: ${example.id}`);
  ids.add(example.id);

  for (const field of ["sdkFamily", "language", "platform", "path", "status"]) {
    assert(typeof example[field] === "string" && example[field].length > 0, `${example.id}: ${field} is required`);
  }
  assert(typeof example.sdk === "object" && example.sdk !== null, `${example.id}: sdk descriptor is required`);
  assert(typeof example.sdk.ecosystem === "string", `${example.id}: sdk ecosystem is required`);

  const normalizedPath = normalize(example.path);
  const expectedPrefix = `${example.sdkFamily}${sep}${example.language}${sep}`;
  assert(
    normalizedPath.startsWith(expectedPrefix) && !normalizedPath.includes(`..${sep}`),
    `${example.id}: path must follow <sdk-family>/<language>/<demo>`,
  );
  assert(!paths.has(normalizedPath), `duplicate example path: ${example.path}`);
  paths.add(normalizedPath);

  const directory = resolve(root, normalizedPath);
  assert(directory.startsWith(`${root}${sep}`), `${example.id}: path escapes repository root`);
  await access(join(directory, "README.md"));

  if (example.sdk.ecosystem !== "npm") {
    throw new Error(`${example.id}: unsupported SDK ecosystem ${example.sdk.ecosystem}`);
  }
  assert(typeof example.sdk.package === "string", `${example.id}: npm SDK package is required`);
  await Promise.all([
    access(join(directory, "package.json")),
    access(join(directory, "package-lock.json")),
  ]);

  const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  assert(packageJson.private === true, `${example.id}: demo package must remain private`);
  assert(
    packageJson.scripts?.["dev:key-file"] === npmKeyFileLauncher,
    `${example.id}: npm demo must expose the standard dev:key-file launcher`,
  );
  const dependency = packageJson.dependencies?.[example.sdk.package];
  assert(typeof dependency === "string", `${example.id}: SDK dependency is missing`);
  assert(
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(dependency),
    `${example.id}: SDK dependency must be an exact registry version`,
  );
  assert(!/^(?:file:|link:|workspace:)/.test(dependency), `${example.id}: local SDK dependency is forbidden`);

  const demoName = example.path.split("/").at(-1);
  const demoLink = "[\u0060" + demoName + "\u0060](" + example.path + "/)";
  const catalogRow = repositoryReadme
    .split("\n")
    .find((line) => line.startsWith("|") && line.includes(demoLink));
  assert(catalogRow !== undefined, `${example.id}: repository README catalog row is missing`);
  const npmVersionUrl = `https://www.npmjs.com/package/${example.sdk.package}/v/${dependency}`;
  const sdkVersionLink = "[\u0060" + example.sdk.package + "@" + dependency + "\u0060](" + npmVersionUrl + ")";
  assert(
    catalogRow.includes(`| ${sdkVersionLink} |`),
    `${example.id}: repository README SDK version link drifted`,
  );

  const lockText = await readFile(join(directory, "package-lock.json"), "utf8");
  const lock = JSON.parse(lockText);
  assert(lock.name === packageJson.name, `${example.id}: lockfile package name drifted`);
  assert(lock.version === packageJson.version, `${example.id}: lockfile package version drifted`);
  assert(lock.packages?.[""]?.name === packageJson.name, `${example.id}: lock root name drifted`);
  assert(
    lock.packages?.[""]?.dependencies?.[example.sdk.package] === dependency,
    `${example.id}: lock root SDK dependency drifted`,
  );
  const installed = lock.packages?.[`node_modules/${example.sdk.package}`];
  assert(installed?.version === dependency, `${example.id}: lockfile SDK version drifted`);
  assert(
    typeof installed?.resolved === "string" && installed.resolved.startsWith("https://registry.npmjs.org/"),
    `${example.id}: lockfile must resolve SDK from the public npm registry`,
  );
  assert(!/(?:file:|link:|workspace:|\/Users\/)/.test(lockText), `${example.id}: lockfile contains a local source`);

  const allowedImports = new Set([
    example.sdk.package,
    `${example.sdk.package}/spi`,
    `${example.sdk.package}/browser`,
  ]);
  for (const sourcePath of ["src/main.ts", "src/sdk-usage.ts"]) {
    const source = await readFile(join(directory, sourcePath), "utf8");
    for (const match of source.matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/g)) {
      const specifier = match[1];
      assert(
        allowedImports.has(specifier) || (specifier.startsWith("./") && !specifier.includes("../")),
        `${example.id}: forbidden import ${specifier}`,
      );
    }
  }

  const viteConfig = await readFile(join(directory, "vite.config.ts"), "utf8");
  assert(viteConfig.includes('base: "./"'), `${example.id}: static subpath-safe Vite base is required`);
}

console.log(`example catalog passed: ${catalog.examples.length} example(s)`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
