import assert from "node:assert/strict";
import test from "node:test";

import { assertLocalSdk, createOverride } from "./use-local-sdk.mjs";

test("accepts an absolute Flutter SDK package path", () => {
  assert.doesNotThrow(() => assertLocalSdk(
    "/work/autoark-eva-client-sdk/flutter",
    "name: autoark_eva_client_sdk\nversion: 0.0.1\n",
  ));
});

test("rejects a relative path and the wrong package", () => {
  assert.throws(
    () => assertLocalSdk("../flutter", "name: autoark_eva_client_sdk\n"),
    /must be absolute/,
  );
  assert.throws(
    () => assertLocalSdk("/work/other", "name: another_package\n"),
    /must declare name: autoark_eva_client_sdk/,
  );
});

test("generates a single ignored Dart dependency override", () => {
  const output = createOverride("/work/SDK checkout/flutter");
  assert.match(output, /^dependency_overrides:/m);
  assert.match(output, /^  autoark_eva_client_sdk:$/m);
  assert.match(output, /^    path: "\/work\/SDK checkout\/flutter"$/m);
  assert.doesNotMatch(output, /0\.0\.1/);
});
