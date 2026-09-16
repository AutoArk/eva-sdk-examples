import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {inspectEnvironment, validateSdkDirectory} from './check-env.mjs';
import {sdkVersion, resolveSdkVersion} from './sdk-version.mjs';
export {sdkVersion} from './sdk-version.mjs';

export const demoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function platformName(os = process.platform, arch = process.arch) {
  if (arch !== 'arm64' || !['darwin', 'linux'].includes(os)) throw new Error(`不支持的平台: ${os}-${arch}`);
  return os === 'darwin' ? 'macos-arm64' : 'linux-arm64';
}
export function run(command, args, capture = false) {
  const result = spawnSync(command, args, {encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit'});
  if (result.error) throw new Error(`无法运行 ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} 失败 (${result.status}): ${result.stderr ?? ''}`);
  return result.stdout;
}
const hash = data => createHash('sha256').update(data).digest('hex');
export function checksum(text, filename) {
  const match = /^([a-fA-F0-9]{64})\s+\*?([^\r\n]+)\s*$/.exec(text.trim());
  if (!match || match[2] !== filename) throw new Error('SHA-256 sidecar 文件名或格式错误');
  return match[1].toLowerCase();
}
export function verifyArchiveNames(names, root) {
  const entries = names.trim().split('\n');
  const seen = new Set();
  for (const name of entries) {
    if (name.startsWith('/') || name.includes('\\') || name.split('/').some(p => p === '..' || p === '.') ||
        !(name === root || name.startsWith(`${root}/`)) || seen.has(name)) {
      throw new Error(`不安全或重复的 archive entry: ${name}`);
    }
    seen.add(name);
  }
}
export function verifyFiles(directory, version = sdkVersion()) {
  const result = validateSdkDirectory(directory, undefined, version);
  if (result.problems.length) throw new Error(result.problems.join('；'));
  const manifest = result.manifest;
  if (!Array.isArray(manifest.files)) throw new Error('manifest 缺少 files');
  const expected = new Set(['manifest.json']);
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || entry.path.startsWith('/') || entry.path.split('/').some(p => !p || p === '..' || p === '.') || expected.has(entry.path)) throw new Error('manifest 文件路径无效');
    expected.add(entry.path);
    const file = path.join(directory, entry.path);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || hash(fs.readFileSync(file)) !== entry.sha256 || (stat.mode & 0o777) !== Number.parseInt(entry.mode, 8)) throw new Error(`SDK 文件校验失败: ${entry.path}`);
  }
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${relative}/`);
      else if (!entry.isFile() || !expected.delete(relative)) throw new Error(`SDK 非预期文件: ${relative}`);
    }
  }
  walk(directory);
  if (expected.size) throw new Error('SDK 缺少文件');
}
export async function download(url, destination, fetcher = fetch) {
  console.log(`下载 ${url}`);
  const response = await fetcher(url, {signal: AbortSignal.timeout(120000)});
  if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}: ${url}`);
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}
export function verifyDigest(archive, expected) {
  if (hash(fs.readFileSync(archive)) !== expected) throw new Error('SDK tarball SHA-256 不匹配');
}
export async function prepareSdk({localSdk, allowLocalVersion = false} = {}) {
  const platform = platformName();
  const version = resolveSdkVersion({localSdk, allowLocalVersion,
    manifestVersion: localSdk ? JSON.parse(fs.readFileSync(path.join(localSdk, 'manifest.json'), 'utf8')).sdkVersion : undefined});
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('需要 Node.js 22+');
  run(process.env.CMAKE ?? 'cmake', ['--version'], true);
  run(process.env.CXX ?? 'c++', ['--version'], true);
  run('tar', ['--version'], true);
  const cache = path.join(demoDir, '.sdk-cache');
  fs.mkdirSync(cache, {recursive: true});
  const lock = path.join(cache, '.prepare-lock');
  try { fs.mkdirSync(lock); } catch { throw new Error(`另一个准备任务正在运行；若上次被强制终止，确认无运行任务后删除 ${lock}`); }
  try {
    let directory;
    let identity;
    if (localSdk) {
      directory = path.resolve(localSdk);
      verifyFiles(directory, version);
      identity = hash(fs.readFileSync(path.join(directory, 'manifest.json')));
    } else {
      const root = `eva-cpp-sdk-${version}-${platform}`;
      const filename = `${root}.tar.gz`;
      const index = path.join(cache, `${root}.json`);
      if (fs.existsSync(index)) {
        identity = JSON.parse(fs.readFileSync(index, 'utf8')).sha256;
        if (!/^[a-f0-9]{64}$/.test(identity)) throw new Error('SDK 缓存索引损坏');
        directory = path.join(cache, identity, root);
        verifyFiles(directory);
      } else {
        const temp = fs.mkdtempSync(path.join(cache, '.download-'));
        try {
          const url = `https://github.com/AutoArk/eva-cpp-sdk-release/releases/download/${version}/${filename}`;
          await download(`${url}.sha256`, path.join(temp, 'checksum'));
          identity = checksum(fs.readFileSync(path.join(temp, 'checksum'), 'utf8'), filename);
          const archive = path.join(temp, filename);
          await download(url, archive);
          verifyDigest(archive, identity);
          verifyArchiveNames(run('tar', ['-tzf', archive], true), root);
          const listing = run('tar', ['-tvzf', archive], true);
          if (listing.trim().split('\n').some(line => !['-', 'd'].includes(line[0]))) throw new Error('SDK archive 不允许链接或特殊文件');
          run('tar', ['-xzf', archive, '-C', temp]);
          verifyFiles(path.join(temp, root));
          const target = path.join(cache, identity);
          if (!fs.existsSync(target)) fs.renameSync(temp, target);
          directory = path.join(target, root);
          verifyFiles(directory);
          fs.writeFileSync(index, JSON.stringify({sha256: identity}) + '\n');
        } finally { fs.rmSync(temp, {recursive: true, force: true}); }
      }
    }
    const check = inspectEnvironment(directory, version);
    if (check.problems.length) throw new Error(check.problems.join('；'));
    console.log(`SDK ${version} ${platform} source=${localSdk ? 'local' : 'GitHub Release'} identity=${identity}`);
    const build = path.join(demoDir, 'build-managed', localSdk ? 'local' : 'release', platform, identity);
    const args = ['-S', demoDir, '-B', build, '-DCMAKE_BUILD_TYPE=Release', `-DEvaClient_DIR=${directory}/lib/cmake/EvaClient`, `-DEVA_LOCAL_SDK_VERSION=${allowLocalVersion ? version : ''}`];
    if (platform === 'macos-arm64') args.push(`-DCMAKE_OSX_DEPLOYMENT_TARGET=${JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')).deploymentTarget.macos}`);
    run(process.env.CMAKE ?? 'cmake', args);
    run(process.env.CMAKE ?? 'cmake', ['--build', build, '--parallel']);
    return path.join(build, 'eva_voice_dialogue_agent');
  } finally { fs.rmdirSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  prepareSdk().then(executable => console.log(executable), error => { console.error(error.message); process.exitCode = 1; });
}
