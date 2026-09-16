import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {validateSdkDirectory} from './check-env.mjs';
import {sdkVersion} from './sdk-version.mjs';

const roots = [];
after(async () => Promise.all(roots.map((root) => rm(root, {recursive: true, force: true}))));

async function candidate(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'eva-cpp-check-env-'));
  roots.push(root);
  const platform = overrides.platform ?? 'macos-arm64';
  const runtime = platform === 'linux-arm64'
    ? 'lib/libeva_client.so'
    : 'lib/libeva_client.dylib';
  const files = [
    'LICENSE', 'README.md', 'docs/public-api.md', 'include/eva/agent.hpp',
    'lib/cmake/EvaClient/EvaClientConfig.cmake', runtime,
    'share/eva/models/silero_vad_v6.onnx',
  ];
  for (const relative of files) {
    const target = join(root, relative);
    await mkdir(dirname(target), {recursive: true});
    await writeFile(target, relative);
  }
  const manifest = {
    schemaVersion: 1,
    sdkVersion: sdkVersion(),
    profile: 'public',
    platform,
    source: {head: 'fixture', dirty: false},
    abi: {arch: 'arm64', cxx: 'C++17'},
    ...overrides,
  };
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
  return root;
}

test('accepts a complete matching SDK directory', async () => {
  const root = await candidate();
  assert.deepEqual(validateSdkDirectory(root, 'macos-arm64').problems, []);
});

test('accepts a complete Linux ARM64 SDK directory', async () => {
  const root = await candidate({platform: 'linux-arm64'});
  assert.deepEqual(validateSdkDirectory(root, 'linux-arm64').problems, []);
});

test('rejects a private or mismatched candidate', async () => {
  const root = await candidate({profile: 'private', platform: 'linux-arm64'});
  const problems = validateSdkDirectory(root, 'macos-arm64').problems.join('\n');
  assert.match(problems, /profile 必须是 public/);
  assert.match(problems, /SDK 平台必须匹配/);
});

test('requires an absolute SDK path', () => {
  assert.match(validateSdkDirectory('relative-sdk', 'macos-arm64').problems[0], /绝对路径/);
});

test('an explicit effective version changes only version validation', async () => {
  const root = await candidate({sdkVersion: '7.8.9'});
  assert.ok(validateSdkDirectory(root, 'macos-arm64').problems.some(p => p.includes('SDK 版本必须')));
  assert.deepEqual(validateSdkDirectory(root, 'macos-arm64', '7.8.9').problems, []);
  const wrongPlatform = validateSdkDirectory(root, 'linux-arm64', '7.8.9').problems;
  assert.ok(wrongPlatform.some(p => p.includes('SDK 平台必须')));
});
