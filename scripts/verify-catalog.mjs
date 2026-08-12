import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(join(root, "examples.json"), "utf8"));
const license = await readFile(join(root, "LICENSE"), "utf8");
const repositoryReadme = await readFile(join(root, "README.md"), "utf8");
const npmKeyFileLauncher = "node scripts/run-npm-demo-with-key-file.mjs";

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
  assert(["dev", "release"].includes(example.status), `${example.id}: status must be dev or release`);
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

  if (example.sdk.ecosystem === "pypi") {
    assert(typeof example.sdk.package === "string", `${example.id}: PyPI SDK package is required`);
    await Promise.all([
      access(join(directory, "pyproject.toml")),
      access(join(directory, "uv.lock")),
      access(join(directory, "check_env.py")),
      access(join(directory, "run_with_key_file.py")),
      access(join(directory, "main.py")),
      access(join(directory, "sdk_usage.py")),
      access(join(directory, "registry-release.json")),
    ]);
    const inspection = spawnSync(
      "python3",
      [join(root, "scripts/inspect-python-demo.py"), directory, example.sdk.package],
      { encoding: "utf8" },
    );
    assert(
      inspection.status === 0,
      `${example.id}: ${inspection.stderr.trim() || "Python demo inspection failed"}`,
    );
    const identity = JSON.parse(inspection.stdout);
    assert(identity.package === example.sdk.package, `${example.id}: inspected package drifted`);

    const demoName = example.path.split("/").at(-1);
    const demoLink = "[\u0060" + demoName + "\u0060](" + example.path + "/)";
    const catalogRow = repositoryReadme
      .split("\n")
      .find((line) => line.startsWith("|") && line.includes(demoLink));
    assert(catalogRow !== undefined, `${example.id}: repository README catalog row is missing`);
    const registryUrl = identity.registry === "testpypi"
      ? `https://test.pypi.org/project/${example.sdk.package}/${identity.version}/`
      : `https://pypi.org/project/${example.sdk.package}/${identity.version}/`;
    const sdkPackageLink = "[\u0060" + example.sdk.package + "\u0060](" + registryUrl + ")";
    assert(
      catalogRow.includes(`| ${sdkPackageLink} |`),
      `${example.id}: repository README SDK package link drifted`,
    );
    continue;
  }

  if (example.sdk.ecosystem === "pub") {
    assert(typeof example.sdk.package === "string", `${example.id}: pub SDK package is required`);
    await Promise.all([
      access(join(directory, "pubspec.yaml")),
      access(join(directory, "pubspec.lock")),
      access(join(directory, "lib/main.dart")),
      access(join(directory, "lib/sdk_usage.dart")),
      access(join(directory, "android/app/src/main/AndroidManifest.xml")),
      access(join(directory, "ios/Runner/Info.plist")),
      access(join(directory, "scripts/run-flutter-demo-with-key-file.mjs")),
      access(join(directory, "scripts/run-flutter-demo-with-key-file.test.mjs")),
      access(join(directory, "scripts/build-android-demo.mjs")),
      access(join(directory, "scripts/build-android-demo.test.mjs")),
      access(join(directory, "scripts/use-local-sdk.mjs")),
      access(join(directory, "scripts/use-local-sdk.test.mjs")),
    ]);
    await assertAbsent(
      join(directory, "pubspec_overrides.yaml"),
      `${example.id}: disable the local SDK override before verifying the public dependency`,
    );
    await assertAbsent(
      join(directory, "integration_test"),
      `${example.id}: SDK integration tests must not be copied into the UI demo`,
    );

    const pubspec = await readFile(join(directory, "pubspec.yaml"), "utf8");
    assert(/^publish_to:\s*["']?none["']?\s*$/m.test(pubspec), `${example.id}: demo must not be publishable`);
    const dependencyPattern = new RegExp(
      `^  ${escapeRegExp(example.sdk.package)}:\\s*(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)\\s*$`,
      "m",
    );
    const dependency = dependencyPattern.exec(pubspec)?.[1];
    assert(typeof dependency === "string", `${example.id}: SDK dependency must be an exact pub version`);
    assert(!/(?:path:|git:|sdk:)/.test(dependency), `${example.id}: local SDK dependency is forbidden`);

    const lockText = await readFile(join(directory, "pubspec.lock"), "utf8");
    const locked = inspectPubLockPackage(lockText, example.sdk.package);
    assert(locked.version === dependency, `${example.id}: pub lock SDK version drifted`);
    assert(locked.source === "hosted", `${example.id}: SDK lock source must be hosted`);
    assert(locked.url === "https://pub.dev", `${example.id}: SDK lock must resolve from pub.dev`);
    assert(/^[0-9a-f]{64}$/.test(locked.sha256), `${example.id}: SDK lock must pin a SHA-256`);
    assert(!/^    source: (?:path|git)\s*$/m.test(lockText), `${example.id}: lockfile contains a local source`);
    assert(!/(?:\.\.[/\\]|\/Users\/|workspace:)/.test(lockText), `${example.id}: lockfile contains a local path`);

    const mainSource = await readFile(join(directory, "lib/main.dart"), "utf8");
    const sdkUsageSource = await readFile(join(directory, "lib/sdk_usage.dart"), "utf8");
    assert(
      !mainSource.includes("EvaAgent.create(") && sdkUsageSource.includes("EvaAgent.create("),
      `${example.id}: SDK creation must stay concentrated in lib/sdk_usage.dart`,
    );
    assert(
      sdkUsageSource.includes("buildEvaAgentConfig(")
        && sdkUsageSource.includes("EvaAgentConfig(")
        && sdkUsageSource.includes("EvaCommandsConfig("),
      `${example.id}: sdk_usage.dart must expose the Agent configuration path`,
    );

    const demoName = example.path.split("/").at(-1);
    const demoLink = "[\u0060" + demoName + "\u0060](" + example.path + "/)";
    const catalogRow = repositoryReadme
      .split("\n")
      .find((line) => line.startsWith("|") && line.includes(demoLink));
    assert(catalogRow !== undefined, `${example.id}: repository README catalog row is missing`);
    const registryUrl = `https://pub.dev/packages/${example.sdk.package}/versions/${dependency}`;
    const sdkPackageLink = "[\u0060" + example.sdk.package + "\u0060](" + registryUrl + ")";
    assert(
      catalogRow.includes(`| ${sdkPackageLink} |`),
      `${example.id}: repository README SDK package link drifted`,
    );
    continue;
  }

  if (example.sdk.ecosystem !== "npm") {
    throw new Error(`${example.id}: unsupported SDK ecosystem ${example.sdk.ecosystem}`);
  }
  assert(typeof example.sdk.package === "string", `${example.id}: npm SDK package is required`);
  await Promise.all([
    access(join(directory, "package.json")),
    access(join(directory, "package-lock.json")),
    access(join(directory, "scripts/run-npm-demo-with-key-file.mjs")),
    access(join(directory, "scripts/run-npm-demo-with-key-file.test.mjs")),
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
  const npmPackageUrl = `https://www.npmjs.com/package/${example.sdk.package}`;
  const sdkPackageLink = "[\u0060" + example.sdk.package + "\u0060](" + npmPackageUrl + ")";
  assert(
    catalogRow.includes(`| ${sdkPackageLink} |`),
    `${example.id}: repository README SDK package link drifted`,
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

async function assertAbsent(path, message) {
  try {
    await access(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(message);
}

function inspectPubLockPackage(lockText, packageName) {
  const escapedName = escapeRegExp(packageName);
  const block = new RegExp(`^  ${escapedName}:\\n((?: {4,}.*\\n)+)`, "m").exec(lockText)?.[1];
  assert(typeof block === "string", `pub lock is missing ${packageName}`);
  const value = (field) => new RegExp(`^ {4,}${field}: ["']?([^"'\\n]+)["']?\\s*$`, "m").exec(block)?.[1];
  return {
    sha256: value("sha256"),
    source: value("source"),
    url: value("url"),
    version: value("version"),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
