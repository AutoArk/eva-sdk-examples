import assert from "node:assert/strict";
import test from "node:test";

import { createFlutterBuildArgs, parseBuildOptions } from "./build-android-demo.mjs";

test("defaults to an APK without a bundled key", () => {
  assert.deepEqual(parseBuildOptions([]), { mode: "debug", keyFilePath: undefined });
  assert.deepEqual(createFlutterBuildArgs({ mode: "debug" }), ["build", "apk", "--debug"]);
});

test("accepts an optional key file and release mode", () => {
  assert.deepEqual(parseBuildOptions(["--key-file", "/keys/eva.env", "--release"]), {
    mode: "release",
    keyFilePath: "/keys/eva.env",
  });
  assert.deepEqual(
    createFlutterBuildArgs({ mode: "release", definesPath: "/private/tmp/defines.json" }),
    ["build", "apk", "--release", "--dart-define-from-file=/private/tmp/defines.json"],
  );
});

test("rejects missing key paths and unknown options", () => {
  assert.throws(() => parseBuildOptions(["--key-file"]), /requires a path/);
  assert.throws(() => parseBuildOptions(["--flavor", "demo"]), /unknown option/);
});
