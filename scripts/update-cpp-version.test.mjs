import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('C++ updater changes only the canonical declaration and rolls back on validation failure', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-upgrade-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const demo = 'client-sdk/cpp/voice-dialogue-agent';
  fs.mkdirSync(path.join(root, demo, 'scripts'), {recursive: true});
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(new URL('./update-sdk-versions.mjs', import.meta.url), path.join(root, 'scripts/update-sdk-versions.mjs'));
  fs.copyFileSync(new URL(`../${demo}/scripts/sdk-version.mjs`, import.meta.url), path.join(root, demo, 'scripts/sdk-version.mjs'));
  fs.writeFileSync(path.join(root, 'examples.json'), JSON.stringify({examples: [{path: demo, sdk: {ecosystem: 'cmake', package: 'EvaClient'}}]}));
  const cmake = path.join(root, demo, 'CMakeLists.txt');
  fs.writeFileSync(cmake, 'set(EVA_SDK_VERSION "1.2.3")\n# keep this\n');
  const validator = path.join(root, 'scripts/verify-catalog.mjs');
  fs.writeFileSync(validator, 'process.exit(0);');
  const run = version => spawnSync(process.execPath, [path.join(root, 'scripts/update-sdk-versions.mjs'), '--cpp', version], {encoding: 'utf8'});
  assert.equal(run('7.8.9').status, 0);
  const updated = 'set(EVA_SDK_VERSION "7.8.9")\n# keep this\n';
  assert.equal(fs.readFileSync(cmake, 'utf8'), updated);
  assert.notEqual(run('v7.8.9').status, 0);
  fs.writeFileSync(validator, 'process.exit(1);');
  assert.notEqual(run('8.0.0').status, 0);
  assert.equal(fs.readFileSync(cmake, 'utf8'), updated);
});
