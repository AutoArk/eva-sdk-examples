import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {prepareSdk, run} from './prepare-sdk.mjs';
import {deviceArguments} from './device-config.mjs';

const demoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultExecutable = path.join(demoDir, 'build-local', 'eva_voice_dialogue_agent');

export function parseKeyFile(contents) {
  const values = [];
  for (const rawLine of contents.replace(/^\ufeff/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?EVA_GATEWAY_API_KEY\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[1];
    if (value.startsWith('"') || value.startsWith("'")) {
      if (value.length < 2 || value.at(-1) !== value[0]) throw new Error('EVA_GATEWAY_API_KEY quotes do not match');
      value = value.slice(1, -1);
    } else if (value.endsWith('"') || value.endsWith("'")) {
      throw new Error('EVA_GATEWAY_API_KEY quotes do not match');
    }
    if (!value || /\s|\0/.test(value)) throw new Error('EVA_GATEWAY_API_KEY must be non-empty and contain no whitespace');
    values.push(value);
  }
  if (values.length !== 1) throw new Error('exactly one valid EVA_GATEWAY_API_KEY assignment required');
  return values[0];
}

export function createRuntimeEnvironment(parentEnvironment = process.env) {
  const environment = {PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'en_US.UTF-8'};
  if (parentEnvironment.HOME) environment.HOME = parentEnvironment.HOME;
  return environment;
}

function forwardRedacted(stream, target, secret) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      target.write(buffer.slice(0, newline + 1).split(secret).join('[REDACTED]'));
      buffer = buffer.slice(newline + 1);
    }
  });
  stream.on('end', () => {
    if (buffer) target.write(buffer.split(secret).join('[REDACTED]'));
  });
}

export function launch({
  keyFile,
  executable = defaultExecutable,
  args = [],
  parentEnvironment = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
}) {
  if (!path.isAbsolute(keyFile) || !path.isAbsolute(executable)) {
    throw new Error('key file and executable paths must be absolute');
  }
  const secret = parseKeyFile(fs.readFileSync(keyFile, 'utf8'));
  fs.accessSync(executable, fs.constants.X_OK);
  const child = spawn(executable, args, {
    cwd: demoDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: createRuntimeEnvironment(parentEnvironment),
  });
  forwardRedacted(child.stdout, stdout, secret);
  forwardRedacted(child.stderr, stderr, secret);
  child.stdin.on('error', () => {});
  child.stdin.end(`${secret}\n`);

  return new Promise((resolve, reject) => {
    const handlers = new Map();
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const handler = () => child.kill(signal);
      handlers.set(signal, handler);
      process.on(signal, handler);
    }
    const cleanup = () => {
      for (const [signal, handler] of handlers) process.off(signal, handler);
    };
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('exit', (code, signal) => {
      cleanup();
      resolve({code: code ?? 1, signal});
    });
  });
}

async function main(argv = process.argv.slice(2)) {
  const [keyFile, ...rest] = argv;
  if (!keyFile || !path.isAbsolute(keyFile)) {
    throw new Error('usage: node scripts/run-with-key-file.mjs /absolute/key-file [-- demo arguments]');
  }
  let localSdk;
  let allowLocalVersion = false;
  let saveDevices = false;
  while (rest.length && rest[0] !== '--') {
    if (rest[0] === '--sdk') {
      rest.shift();
      localSdk = rest.shift();
      if (!localSdk || !path.isAbsolute(localSdk)) throw new Error('--sdk requires an absolute SDK directory');
    } else if (rest[0] === '--allow-local-version') { rest.shift(); allowLocalVersion = true; }
    else if (rest[0] === '--save-devices') { rest.shift(); saveDevices = true; }
    else break;
  }
  if (rest[0] === '--') rest.shift();
  const diagnostic = rest.includes('--help') || rest.includes('--list-cameras');
  if (!diagnostic) parseKeyFile(fs.readFileSync(keyFile, 'utf8'));
  const args = diagnostic ? rest : deviceArguments(rest, {save: saveDevices});
  const executable = await prepareSdk({localSdk, allowLocalVersion});
  if (diagnostic) { run(executable, args); return 0; }
  console.log('从 key 文件映射 1 个变量并启动 C++ demo（值已隐藏）。');
  const result = await launch({keyFile, executable, args});
  if (result.signal) console.error(`demo terminated by ${result.signal}`);
  return result.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      const hint = error.code === 'ENOENT'
        ? ' 请检查 key 文件路径以及 Node、CMake、C++ compiler 和 tar 是否已安装。'
        : '';
      console.error(`key-file launch failed: ${error.message}${hint}`);
      process.exitCode = 1;
    },
  );
}
