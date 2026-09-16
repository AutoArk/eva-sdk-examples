import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {checksum, verifyArchiveNames, platformName, sdkVersion, download, verifyDigest} from './prepare-sdk.mjs';
import {createHash} from 'node:crypto';
import {deviceArguments} from './device-config.mjs';

test('release identity is exact and unsupported hosts fail', () => {
  assert.match(sdkVersion(), /^\d+\.\d+\.\d+$/);
  assert.equal(platformName('linux', 'arm64'), 'linux-arm64');
  assert.equal(platformName('darwin', 'arm64'), 'macos-arm64');
  assert.throws(() => platformName('linux', 'x64'));
  assert.throws(() => platformName('win32', 'arm64'));
});
test('checksum sidecar must name the selected asset', () => {
  const digest = 'a'.repeat(64);
  assert.equal(checksum(`${digest}  sdk.tar.gz\n`, 'sdk.tar.gz'), digest);
  assert.throws(() => checksum(`${digest}  other.tar.gz`, 'sdk.tar.gz'));
  assert.throws(() => checksum('bad  sdk.tar.gz', 'sdk.tar.gz'));
});
test('archive rejects escape, foreign root and duplicate entries', () => {
  verifyArchiveNames('sdk/\nsdk/lib/x.so\n', 'sdk');
  for (const entry of ['/sdk/a', 'sdk/../a', 'other/a', 'sdk/a\nsdk/a', 'sdk/..\\a']) {
    assert.throws(() => verifyArchiveNames(entry, 'sdk'));
  }
});
test('failed and interrupted downloads never produce a usable archive; corruption fails digest', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-download-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'sdk.tar.gz');
  await assert.rejects(download('https://example.invalid/sdk', file, async () => new Response('', {status: 404})), /404/);
  assert.equal(fs.existsSync(file), false);
  await assert.rejects(download('https://example.invalid/sdk', file, async () => ({ok: true, arrayBuffer: async () => {throw new Error('connection interrupted');}})), /interrupted/);
  assert.equal(fs.existsSync(file), false);
  await download('https://example.invalid/sdk', file, async () => new Response('sdk'));
  verifyDigest(file, createHash('sha256').update('sdk').digest('hex'));
  fs.appendFileSync(file, 'corrupt');
  assert.throws(() => verifyDigest(file, createHash('sha256').update('sdk').digest('hex')), /SHA-256/);
});
test('Linux device settings persist, explicit args override, camera stays opt-in', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-devices-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'devices.json');
  assert.throws(() => deviceArguments([], {file, platform: 'linux'}), /首次/);
  const initial = ['--camera', '--input-device', 'in', '--output-device', 'out', '--camera-device', 'cam'];
  assert.deepEqual(deviceArguments(initial, {file, platform: 'linux', save: true}), initial);
  assert.deepEqual(deviceArguments([], {file, platform: 'linux'}), ['--input-device', 'in', '--output-device', 'out']);
  assert.deepEqual(deviceArguments(['--input-device', 'new', '--camera'], {file, platform: 'linux'}), ['--input-device', 'new', '--camera', '--output-device', 'out', '--camera-device', 'cam']);
  assert.throws(() => deviceArguments(['--input-device'], {file, platform: 'linux'}));
});
