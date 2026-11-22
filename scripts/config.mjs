import { access, chmod, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const localDataPath = resolve(root, '.cuebase/local-state');

export async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

export function requireNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    throw new Error('Cuebase needs Node.js 22.12 or newer. Install a current LTS release from https://nodejs.org/.');
  }
}

export async function writePrivate(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, value, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  await chmod(path, 0o600);
}

export function command(program, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(program, args, {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', ...options.env },
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${options.label || 'Command'} failed (exit ${code}).`));
    });
  });
}
