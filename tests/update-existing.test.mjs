// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyUpdate } from '../scripts/update-existing.mjs';

const roots = [];
async function fixture(name = 'prompta') {
  const root = await mkdtemp(path.join(tmpdir(), 'cuebase-update-'));
  roots.push(root);
  const source = path.join(root, 'download');
  const target = path.join(root, 'repository');
  for (const folder of [source, target]) await mkdir(folder);
  for (const folder of ['src', 'worker', 'scripts', 'public', 'tests', 'docs']) await mkdir(path.join(source, folder));
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'cuebase', version: '0.8.0' }));
  await writeFile(path.join(source, 'package-lock.json'), '{}');
  await writeFile(path.join(source, '.gitignore'), '.cuebase/\n.dev.vars*\nnode_modules/\ndist/\n');
  await writeFile(path.join(source, 'src', 'main.ts'), 'new Cuebase app');
  await writeFile(path.join(target, 'package.json'), JSON.stringify({ name, version: '0.7.0' }));
  expect(spawnSync('git', ['init', target], { stdio: 'ignore' }).status).toBe(0);
  return { source, target };
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('Windows project updater data preservation', () => {
  it('backs up replaced source, preserves repository/private bytes and removes obsolete deploy files from the working project', async () => {
    const { source, target } = await fixture();
    await mkdir(path.join(target, 'src'));
    await mkdir(path.join(target, 'public'));
    await writeFile(path.join(target, 'src', 'old.ts'), 'previous custom code');
    await writeFile(path.join(target, 'public', '_redirects'), '/* /index.html 200');
    await writeFile(path.join(target, 'wrangler.json'), '{"old":"Worker deployment"}');
    await writeFile(path.join(target, '.dev.vars'), 'PIN="12345678"');
    await writeFile(path.join(target, '.gitignore'), 'my-own-cache/\n');
    await writeFile(path.join(target, 'personal-notes.txt'), 'keep me');
    expect(spawnSync('git', ['-C', target, 'add', '.'], { stdio: 'ignore' }).status).toBe(0);
    const result = await applyUpdate(source, target);
    expect(JSON.parse(await readFile(path.join(target, 'package.json'))).name).toBe('cuebase');
    expect(await readFile(path.join(target, 'src', 'main.ts'), 'utf8')).toBe('new Cuebase app');
    expect(await readFile(path.join(result.backup, 'src', 'old.ts'), 'utf8')).toBe('previous custom code');
    expect(await readFile(path.join(result.backup, 'public', '_redirects'), 'utf8')).toBe('/* /index.html 200');
    expect(await readFile(path.join(target, '.dev.vars'), 'utf8')).toBe('PIN="12345678"');
    expect(await readFile(path.join(target, 'personal-notes.txt'), 'utf8')).toBe('keep me');
    await expect(access(path.join(target, 'wrangler.json'))).rejects.toThrow();
    await expect(access(path.join(target, 'public', '_redirects'))).rejects.toThrow();
    expect(spawnSync('git', ['-C', target, 'ls-files', '.dev.vars'], { encoding: 'utf8' }).stdout).toBe('');
    const ignored = spawnSync('git', ['-C', target, 'check-ignore', result.backup], { encoding: 'utf8' });
    expect(ignored.status).toBe(0);
    expect(await readFile(path.join(target, '.gitignore'), 'utf8')).toContain('my-own-cache/');
    expect(result.untrackedPrivateFiles).toBe(1);
  });
  it('refuses another product before changing any files', async () => {
    const { source, target } = await fixture('another-product');
    const before = await readFile(path.join(target, 'package.json'), 'utf8');
    await expect(applyUpdate(source, target)).rejects.toThrow('existing Prompta or Cuebase');
    expect(await readFile(path.join(target, 'package.json'), 'utf8')).toBe(before);
    await expect(access(path.join(target, '.cuebase'))).rejects.toThrow();
  });
  it('refuses to overwrite the download itself', async () => {
    const { source } = await fixture();
    await expect(applyUpdate(source, source)).rejects.toThrow('outside your GitHub');
    expect(JSON.parse(await readFile(path.join(source, 'package.json'))).name).toBe('cuebase');
  });
});
