import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.devices.json');
const flags = ['--input-device', '--output-device', '--camera-device'];
export function deviceArguments(args, {save = false, file = configPath, platform = process.platform} = {}) {
  const stored = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored) || Object.entries(stored).some(([k,v]) => !flags.includes(k) || typeof v !== 'string' || !v || v.startsWith('--'))) throw new Error('本机 .devices.json 格式无效');
  const selected = {...stored};
  for (let i = 0; i < args.length; i++) {
    if (!flags.includes(args[i])) continue;
    if (!args[i+1] || args[i+1].startsWith('--')) throw new Error(`${args[i]} 缺少设备值`);
    selected[args[i]] = args[++i];
  }
  if (platform === 'linux' && (!selected['--input-device'] || !selected['--output-device'])) {
    throw new Error('首次在 Linux 启动需选择设备：用 arecord -L / aplay -L 查看候选，传 --save-devices -- --input-device PCM --output-device PCM 保存选择；后续自动复用。');
  }
  const result = [...args];
  for (const flag of flags) {
    if (flag === '--camera-device' && !args.includes('--camera')) continue;
    if (platform !== 'linux' && flag !== '--camera-device') continue;
    if (selected[flag] && !args.includes(flag)) result.push(flag, selected[flag]);
  }
  if (save) fs.writeFileSync(file, JSON.stringify(selected, null, 2) + '\n', {mode: 0o600});
  return result;
}
