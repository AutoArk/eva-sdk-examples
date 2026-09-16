import fs from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

export const versionDeclaration = /set\(EVA_SDK_VERSION "(\d+\.\d+\.\d+)"\)/g;
export function readSdkVersion(contents) {
  const matches = [...contents.matchAll(versionDeclaration)];
  if (matches.length !== 1) throw new Error('CMakeLists.txt 必须且只能声明一个 EVA_SDK_VERSION');
  return matches[0][1];
}
export function sdkVersion() {
  return readSdkVersion(fs.readFileSync(new URL('../CMakeLists.txt', import.meta.url), 'utf8'));
}
export function resolveSdkVersion({localSdk, allowLocalVersion = false, manifestVersion, defaultVersion = sdkVersion()} = {}) {
  if (allowLocalVersion && !localSdk) throw new Error('--allow-local-version 必须与 --sdk 一起使用');
  if (!localSdk) return defaultVersion;
  if (!/^\d+\.\d+\.\d+$/.test(manifestVersion ?? '')) throw new Error('本地 manifest SDK 版本必须为不带 v 的三段数字');
  if (!allowLocalVersion && manifestVersion !== defaultVersion) throw new Error(`SDK 版本必须是 ${defaultVersion}；试用其它本地版本需显式传 --allow-local-version`);
  return allowLocalVersion ? manifestVersion : defaultVersion;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(sdkVersion());
