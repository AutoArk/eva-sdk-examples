import test from 'node:test';
import assert from 'node:assert/strict';
import {readSdkVersion, resolveSdkVersion, sdkVersion} from './sdk-version.mjs';

test('version declaration must be unique; local overrides are explicit and scoped', () => {
  assert.equal(readSdkVersion('set(EVA_SDK_VERSION "7.8.9")'), '7.8.9');
  assert.throws(() => readSdkVersion('set(EVA_SDK_VERSION "v7.8.9")'));
  assert.throws(() => readSdkVersion('set(EVA_SDK_VERSION "7.8.9")\nset(EVA_SDK_VERSION "7.8.9")'));
  assert.equal(resolveSdkVersion(), sdkVersion());
  assert.throws(() => resolveSdkVersion({allowLocalVersion: true}));
  assert.throws(() => resolveSdkVersion({localSdk: '/sdk', manifestVersion: '7.8.9', defaultVersion: '1.2.3'}));
  assert.equal(resolveSdkVersion({localSdk: '/sdk', manifestVersion: '7.8.9', allowLocalVersion: true}), '7.8.9');
  assert.equal(resolveSdkVersion(), sdkVersion());
  for (const manifestVersion of ['v1.2.3', 'latest', '1.2.3;other']) assert.throws(() => resolveSdkVersion({localSdk: '/sdk', allowLocalVersion: true, manifestVersion}));
});
