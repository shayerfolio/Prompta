import { cp, mkdir, readFile, readdir, realpath, rm, lstat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directories = ['src', 'worker', 'migrations', 'public', 'scripts', 'tests', 'docs', 'dist'];
const files = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', '.gitignore', '.env.example',
  'README.md', 'START_HERE.txt', 'Update-Cuebase.bat', 'Start-Cuebase.bat', 'Start-Cuebase.command'];
const obsolete = ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml', 'wrangler.config.json', 'Start-Prompta.bat', 'Start-Prompta.command'];
const privatePaths = ['.dev.vars', '.dev.vars.*', '.env', '.env.local', '.env.*.local', '.prompta', '.cuebase', '.wrangler',
  'wrangler.config.json', 'node_modules', 'dist'];

async function exists(file) { try { await lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function rejectLinks(file) {
  if (!await exists(file)) return;
  const info = await lstat(file);
  if (info.isSymbolicLink()) throw new Error(`The update stopped because ${path.basename(file)} is a linked file or folder. Use a normal project copy.`);
  if (info.isDirectory()) for (const entry of await readdir(file)) await rejectLinks(path.join(file, entry));
}
function git(command, folder, args) {
  const result = spawnSync(command, ['-C', folder, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Git could not update this project. Close any unfinished Git operation and try again. Your local files are retained.');
  return result.stdout;
}
async function findGit() {
  const check = command => { const result = spawnSync(command, ['--version'], { windowsHide: true, stdio: 'ignore' }); return !result.error && result.status === 0; };
  if (check('git')) return 'git';
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const desktop = path.join(process.env.LOCALAPPDATA, 'GitHubDesktop');
    if (await exists(desktop)) {
      const versions = (await readdir(desktop)).filter(name => /^app-[0-9]/.test(name)).sort().reverse();
      for (const version of versions) {
        const candidate = path.join(desktop, version, 'resources', 'app', 'git', 'cmd', 'git.exe');
        if (await exists(candidate) && check(candidate)) return candidate;
      }
    }
  }
  throw new Error('Install or open GitHub Desktop first, then run Update-Cuebase.bat again.');
}

export async function applyUpdate(sourceFolder, targetFolder, gitCommand = 'git') {
  const source = await realpath(sourceFolder);
  const target = await realpath(targetFolder);
  const nested = (parent, child) => { const relative = path.relative(parent, child); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); };
  if (nested(source, target) || nested(target, source)) throw new Error('Extract Cuebase outside your GitHub project folder, then select the existing project folder.');
  const incoming = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
  const current = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
  if (incoming.name !== 'cuebase' || !['prompta', 'cuebase'].includes(current.name)) throw new Error('Choose your existing Prompta or Cuebase project folder. No files were changed.');
  if (!await exists(path.join(target, '.git'))) throw new Error('Choose the repository folder shown by GitHub Desktop > Repository > Show in Explorer.');
  git(gitCommand, target, ['rev-parse', '--is-inside-work-tree']);
  // Resolve every managed path before making changes. Never follow a junction or symlink into unrelated files.
  for (const name of [...directories, ...files, ...obsolete]) {
    await rejectLinks(path.join(source, name));
    await rejectLinks(path.join(target, name));
  }
  if (await exists(path.join(target, '.cuebase'))) await rejectLinks(path.join(target, '.cuebase'));
  for (const required of ['src', 'worker', 'scripts', 'package.json', 'package-lock.json']) {
    if (!await exists(path.join(source, required))) throw new Error('The downloaded folder is incomplete. Extract the full Cuebase ZIP and try again.');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(16).slice(2, 8);
  const backup = path.join(target, '.cuebase', 'update-backups', stamp);
  await mkdir(backup, { recursive: true });
  for (const name of [...directories, ...files, ...obsolete]) {
    if (await exists(path.join(target, name))) await cp(path.join(target, name), path.join(backup, name), { recursive: true, errorOnExist: true });
  }
  const oldIgnore = await exists(path.join(target, '.gitignore')) ? await readFile(path.join(target, '.gitignore'), 'utf8') : '';
  const newIgnore = await readFile(path.join(source, '.gitignore'), 'utf8');
  const trackedPrivate = git(gitCommand, target, ['ls-files', '-z', '--', ...privatePaths]).split('\0').filter(Boolean);
  // Remove only private files/build output from Git's index. Their local bytes stay on disk.
  if (trackedPrivate.length) git(gitCommand, target, ['rm', '--cached', '--force', '-r', '--ignore-unmatch', '--', ...privatePaths]);
  for (const name of directories) {
    await rm(path.join(target, name), { recursive: true, force: true });
    if (await exists(path.join(source, name))) await cp(path.join(source, name), path.join(target, name), { recursive: true });
  }
  for (const name of files) if (await exists(path.join(source, name))) await cp(path.join(source, name), path.join(target, name));
  // Preserve custom ignore rules while ensuring the migration backup and local secrets are ignored.
  await writeFile(path.join(target, '.gitignore'), `${oldIgnore.trimEnd()}\n${newIgnore.trimEnd()}\n`);
  for (const name of obsolete) await rm(path.join(target, name), { force: true });
  return { target, backup, untrackedPrivateFiles: trackedPrivate.length };
}

async function main() {
  console.log('\nCuebase update\nUpdates the project on this computer. Nothing is uploaded or deployed.\n');
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const probable = path.join(homedir(), 'Documents', 'GitHub', 'Prompta');
    const defaultFolder = await exists(path.join(probable, 'package.json')) ? probable : '';
    const answer = await input.question(`Existing GitHub project folder${defaultFolder ? ` [${defaultFolder}]` : ''}: `);
    const target = answer.trim().replace(/^"(.*)"$/, '$1') || defaultFolder;
    if (!target) throw new Error('No folder was selected. Nothing was changed.');
    const result = await applyUpdate(packageRoot, target, await findGit());
    console.log(`\nCuebase files are ready in:\n${result.target}\n\nPrevious project files were saved in:\n${result.backup}`);
    if (result.untrackedPrivateFiles) console.log('\nPrivate settings and build files were removed from Git tracking; local copies remain. Set a new PIN in Cloudflare if an old PIN was previously uploaded.');
    console.log('\nOpen GitHub Desktop. Review the changes, commit them, and click Push origin.\nThen follow START_HERE.txt for the two Cloudflare settings.');
  } finally { input.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`\n${error.message}\n`); process.exitCode = 1; });
}
