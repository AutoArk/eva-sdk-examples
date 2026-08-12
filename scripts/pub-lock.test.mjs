import assert from "node:assert/strict";
import test from "node:test";

import { inspectPubLockPackage } from "./pub-lock.mjs";

const lfLock = `packages:
  autoark_eva_client_sdk:
    dependency: "direct main"
    description:
      name: autoark_eva_client_sdk
      sha256: "71b1118368abd322d5ccbf1441bcae31763de2343f203902669135f282130ff7"
      url: "https://pub.dev"
    source: hosted
    version: "0.0.1"
  following_package:
    dependency: transitive
`;

const expected = {
  sha256: "71b1118368abd322d5ccbf1441bcae31763de2343f203902669135f282130ff7",
  source: "hosted",
  url: "https://pub.dev",
  version: "0.0.1",
};

test("parses the public package fields from an LF pub lock", () => {
  assert.deepEqual(inspectPubLockPackage(lfLock, "autoark_eva_client_sdk"), expected);
});

test("parses the same public package fields from a CRLF pub lock", () => {
  const crlfLock = lfLock.replaceAll("\n", "\r\n");
  assert.deepEqual(inspectPubLockPackage(crlfLock, "autoark_eva_client_sdk"), expected);
});

test("rejects a pub lock without the requested package", () => {
  assert.throws(
    () => inspectPubLockPackage(lfLock, "missing_package"),
    /pub lock is missing missing_package/,
  );
});
