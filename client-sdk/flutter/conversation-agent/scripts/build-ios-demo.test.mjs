import assert from "node:assert/strict";
import test from "node:test";

import { createFlutterBuildArgs, parseBuildOptions } from "./build-ios-demo.mjs";

test("defaults to a release iOS app without a bundled key", () => {
  assert.deepEqual(parseBuildOptions([]), { mode: "release", keyFilePath: undefined });
  assert.deepEqual(createFlutterBuildArgs({ mode: "release" }), ["build", "ios", "--release"]);
});

test("accepts an optional key file and release mode", () => {
  assert.deepEqual(parseBuildOptions(["--key-file", "/keys/eva.env", "--release"]), {
    mode: "release",
    keyFilePath: "/keys/eva.env",
  });
  assert.deepEqual(
    createFlutterBuildArgs({ mode: "release", definesPath: "/private/tmp/defines.json" }),
    ["build", "ios", "--release", "--dart-define-from-file=/private/tmp/defines.json"],
  );
});

test("rejects missing key paths and unknown options", () => {
  assert.throws(() => parseBuildOptions(["--key-file"]), /requires a path/);
  assert.throws(() => parseBuildOptions(["--flavor", "demo"]), /unknown option/);
});

test("accepts an explicit debug mode", () => {
  assert.deepEqual(parseBuildOptions(["--debug"]), { mode: "debug", keyFilePath: undefined });
});
