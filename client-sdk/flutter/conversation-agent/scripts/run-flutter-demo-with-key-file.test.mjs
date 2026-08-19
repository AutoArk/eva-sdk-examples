import assert from "node:assert/strict";
import test from "node:test";

import { createFlutterArgs, parseKeyFile } from "./run-flutter-demo-with-key-file.mjs";

test("maps only the standard Gateway key", () => {
  assert.deepEqual(parseKeyFile([
    "# managed outside the repository",
    "OTHER_VALUE=ignored",
    "EVA_GATEWAY_API_KEY=ak-test-value",
  ].join("\n")), { EVA_GATEWAY_API_KEY: "ak-test-value" });
});

test("rejects missing, duplicate, whitespace, and unmatched-quote values", () => {
  assert.throws(() => parseKeyFile("OTHER_VALUE=ignored"), /missing EVA_GATEWAY_API_KEY/);
  assert.throws(
    () => parseKeyFile("EVA_GATEWAY_API_KEY=ak-one\nEVA_GATEWAY_API_KEY=ak-two"),
    /duplicate EVA_GATEWAY_API_KEY/,
  );
  assert.throws(() => parseKeyFile("EVA_GATEWAY_API_KEY=ak has spaces"), /without whitespace/);
  assert.throws(() => parseKeyFile("EVA_GATEWAY_API_KEY=\"ak-value"), /unmatched quotes/);
});

test("defaults to release and places the private defines file before forwarded options", () => {
  assert.deepEqual(createFlutterArgs("/private/tmp/defines.json", ["-d", "emulator-5554"]), [
    "run",
    "--dart-define-from-file=/private/tmp/defines.json",
    "--release",
    "-d",
    "emulator-5554",
  ]);
});

test("keeps an explicitly requested debug mode", () => {
  assert.deepEqual(createFlutterArgs("/private/tmp/defines.json", ["--debug", "-d", "emulator-5554"]), [
    "run",
    "--dart-define-from-file=/private/tmp/defines.json",
    "--debug",
    "-d",
    "emulator-5554",
  ]);
});
