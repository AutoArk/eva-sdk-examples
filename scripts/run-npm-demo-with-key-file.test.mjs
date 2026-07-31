import assert from "node:assert/strict";
import test from "node:test";

import {
  createNpmDevArgs,
  createNpmInvocation,
  createRuntimeEnvironment,
  keyMappings,
  parseKeyFile,
} from "./run-npm-demo-with-key-file.mjs";

test("forwards custom Vite options after npm's argument separator", () => {
  assert.deepEqual(createNpmDevArgs(["--port", "4173"]), [
    "run",
    "dev",
    "--",
    "--port",
    "4173",
  ]);
});

test("launches npm directly on non-Windows platforms", () => {
  const npmArgs = createNpmDevArgs(["--port", "4173"]);

  assert.deepEqual(createNpmInvocation(npmArgs, { platform: "linux" }), {
    command: "npm",
    args: ["run", "dev", "--", "--port", "4173"],
  });
});

test("launches npm's JavaScript CLI through Node on Windows", () => {
  const npmArgs = createNpmDevArgs(["--port", "4173"]);

  assert.deepEqual(createNpmInvocation(npmArgs, {
    platform: "win32",
    nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
    npmCliPath: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
  }), {
    command: "C:\\Program Files\\nodejs\\node.exe",
    args: [
      "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
      "run",
      "dev",
      "--",
      "--port",
      "4173",
    ],
  });
});

test("requires npm's JavaScript CLI path for the Windows launcher", () => {
  assert.throws(
    () => createNpmInvocation(["run", "dev"], {
      platform: "win32",
      npmCliPath: undefined,
    }),
    /start this launcher with npm run dev:key-file/,
  );
});

test("parses the standard key file without exposing unrelated fields", () => {
  const contents = [
    "# managed outside the repository",
    "OTHER_VALUE=ignored",
    "EVA_GATEWAY_API_KEY=ak-test-value",
    "",
  ].join("\n");

  assert.deepEqual(parseKeyFile(contents), {
    EVA_GATEWAY_API_KEY: "ak-test-value",
  });
});

test("accepts unquoted, double-quoted, and single-quoted values", () => {
  const assignments = [
    "EVA_GATEWAY_API_KEY=ak-test-value",
    "EVA_GATEWAY_API_KEY=\"ak-test-value\"",
    "EVA_GATEWAY_API_KEY='ak-test-value'",
  ];

  for (const assignment of assignments) {
    assert.deepEqual(parseKeyFile(assignment), {
      EVA_GATEWAY_API_KEY: "ak-test-value",
    });
  }
});

test("rejects missing, duplicate, empty, whitespace, and unmatched-quote values", () => {
  assert.throws(() => parseKeyFile("OTHER_VALUE=ignored"), /missing EVA_GATEWAY_API_KEY/);
  assert.throws(
    () => parseKeyFile("EVA_GATEWAY_API_KEY=ak-one\nEVA_GATEWAY_API_KEY=ak-two"),
    /duplicate EVA_GATEWAY_API_KEY/,
  );
  assert.throws(() => parseKeyFile("EVA_GATEWAY_API_KEY="), /non-empty/);
  assert.throws(() => parseKeyFile("EVA_GATEWAY_API_KEY=ak has spaces"), /without whitespace/);
  assert.throws(() => parseKeyFile("EVA_GATEWAY_API_KEY=\"ak-value"), /unmatched quotes/);
});

test("maps the standard key to Vite without retaining the source variable", () => {
  const environment = createRuntimeEnvironment(
    { EVA_GATEWAY_API_KEY: "ak-secret" },
    keyMappings,
    {
      PATH: "/usr/bin",
      EVA_GATEWAY_API_KEY: "stale-value",
    },
  );

  assert.deepEqual(environment, {
    PATH: "/usr/bin",
    VITE_EVA_API_KEY: "ak-secret",
  });
});

test("parses and maps multiple configured keys", () => {
  const mappings = [
    { source: "EVA_GATEWAY_API_KEY", target: "VITE_EVA_API_KEY" },
    { source: "EVA_SECONDARY_TOKEN", target: "VITE_EVA_SECONDARY_TOKEN" },
  ];
  const values = parseKeyFile(
    "EVA_GATEWAY_API_KEY=ak-primary\nEVA_SECONDARY_TOKEN=token-secondary\n",
    mappings,
  );

  assert.deepEqual(values, {
    EVA_GATEWAY_API_KEY: "ak-primary",
    EVA_SECONDARY_TOKEN: "token-secondary",
  });
  assert.deepEqual(createRuntimeEnvironment(values, mappings, { PATH: "/usr/bin" }), {
    PATH: "/usr/bin",
    VITE_EVA_API_KEY: "ak-primary",
    VITE_EVA_SECONDARY_TOKEN: "token-secondary",
  });
});
