#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {sdkVersion} from './sdk-version.mjs';

function supportedPlatform(system = process.platform, architecture = process.arch) {
  if (architecture !== 'arm64') return null;
  if (system === 'darwin') return 'macos-arm64';
  if (system === 'linux') return 'linux-arm64';
  return null;
}

function commandVersion(command, args = ['--version']) {
  if (!command) return null;
  const result = spawnSync(command, args, {encoding: 'utf8'});
  if (result.error || result.status !== 0) return null;
  return `${result.stdout}${result.stderr}`.trim().split('\n')[0];
}

function findCompiler() {
  const candidates = [process.env.CXX, 'c++', 'clang++', 'g++'].filter(Boolean);
  return candidates.find((candidate) => commandVersion(candidate)) ?? null;
}

function findCmake() {
  const candidates = [process.env.CMAKE, 'cmake'].filter(Boolean);
  return candidates.find((candidate) => commandVersion(candidate)) ?? null;
}

function cmakeIsSupported(versionLine) {
  const match = /cmake version (\d+)\.(\d+)/i.exec(versionLine ?? '');
  return Boolean(match) && (Number(match[1]) > 3 || Number(match[1]) === 3 && Number(match[2]) >= 16);
}

export function validateSdkDirectory(sdkDir, platform = supportedPlatform(), expectedVersion = sdkVersion()) {
  const problems = [];
  const details = [];
  if (!path.isAbsolute(sdkDir)) return {problems: ['SDK 路径必须是绝对路径'], details};
  const manifestPath = path.join(sdkDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return {problems: [`缺少 ${manifestPath}`], details};

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return {problems: [`manifest.json 无效: ${error.message}`], details};
  }
  if (manifest.schemaVersion !== 1) problems.push('manifest schemaVersion 必须是 1');
  if (manifest.sdkVersion !== expectedVersion) problems.push(`SDK 版本必须是 ${expectedVersion}`);
  if (manifest.profile !== 'public') problems.push('SDK profile 必须是 public');
  if (manifest.source?.dirty !== false) problems.push('SDK source 必须是 clean build');
  if (manifest.abi?.arch !== 'arm64' || manifest.abi?.cxx !== 'C++17') {
    problems.push('SDK ABI 必须是 ARM64/C++17');
  }
  if (!platform) problems.push(`当前宿主不受支持: ${process.platform}-${process.arch}`);
  if (platform && manifest.platform !== platform) problems.push(`SDK 平台必须匹配当前宿主 ${platform}`);

  const runtime = platform === 'macos-arm64' ? 'lib/libeva_client.dylib' : 'lib/libeva_client.so';
  const required = [
    'LICENSE', 'README.md', 'docs/public-api.md', 'include/eva/agent.hpp',
    'lib/cmake/EvaClient/EvaClientConfig.cmake', runtime,
    'share/eva/models/silero_vad_v6.onnx',
  ];
  for (const relative of required) {
    if (!fs.existsSync(path.join(sdkDir, relative))) problems.push(`SDK 缺少 ${relative}`);
  }
  details.push(`sdk.version=${manifest.sdkVersion ?? 'unknown'}`);
  details.push(`sdk.platform=${manifest.platform ?? 'unknown'}`);
  details.push(`sdk.source=${manifest.source?.head ?? 'unknown'}`);
  return {problems, details, manifest, runtime: path.join(sdkDir, runtime)};
}

export function inspectEnvironment(sdkDir, expectedVersion = sdkVersion()) {
  const problems = [];
  const details = [`host=${process.platform}-${process.arch}`, `node=${process.versions.node}`];
  const platform = supportedPlatform();
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 22) problems.push('Node.js 版本低于 22');

  const compiler = findCompiler();
  const cmake = findCmake();
  const cmakeVersion = commandVersion(cmake);
  details.push(`compiler=${compiler ? commandVersion(compiler) : 'missing'}`);
  details.push(`cmake=${cmakeVersion ?? 'missing'}`);
  if (!compiler) problems.push('未找到 C++ compiler');
  if (!cmake) problems.push('未找到 CMake');
  else if (!cmakeIsSupported(cmakeVersion)) problems.push('CMake 版本低于 3.16');

  const sdk = validateSdkDirectory(sdkDir, platform, expectedVersion);
  details.push(...sdk.details);
  problems.push(...sdk.problems);
  if (platform === 'linux-arm64' && sdk.runtime && fs.existsSync(sdk.runtime)) {
    const linked = spawnSync('ldd', [sdk.runtime], {encoding: 'utf8'});
    if (linked.error || linked.status !== 0) problems.push('无法用 ldd 检查 Linux SDK runtime');
    else if (`${linked.stdout}${linked.stderr}`.includes('not found')) problems.push('Linux SDK 存在未满足的动态库依赖');
  }
  return {problems, details};
}

function repairCommands() {
  if (process.platform === 'darwin') {
    return ['xcode-select --install', 'brew install cmake node'];
  }
  if (process.platform === 'linux') {
    return [
      'sudo apt-get update',
      'sudo apt-get install -y build-essential cmake nodejs libasound2 libcurl4 alsa-utils',
    ];
  }
  return [];
}

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !path.isAbsolute(argv[0])) {
    throw new Error('usage: node scripts/check-env.mjs /absolute/path/to/unpacked-sdk');
  }
  const result = inspectEnvironment(argv[0]);
  for (const detail of result.details) console.log(`environment: ${detail}`);
  if (result.problems.length === 0) {
    console.log('PASS: C++ demo 环境与 SDK preflight 通过。');
    return 0;
  }
  console.error(`FAIL: ${result.problems.join('；')}`);
  const commands = repairCommands();
  if (commands.length) {
    console.error('按需安装缺失工具后重新运行；不要重复安装已存在的组件：');
    for (const command of commands) console.error(command);
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`environment check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
