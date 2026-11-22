#!/usr/bin/env node
/** Local Cloudflare Pages, D1 and PIN access. Never deploys or logs in. */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { command, exists, localDataPath, requireNode, root } from './config.mjs';

function options() {
  const args = process.argv.slice(2);
  const parsed = { dev: false, open: false, port: undefined, host: undefined };
  while (args.length) {
    const argument = args.shift();
    if (argument === '--dev') parsed.dev = true;
    else if (argument === '--open') parsed.open = true;
    else if (argument === '--strictPort') { /* Wrangler receives the explicit port below. */ }
    else if (argument === '--help') return { help: true };
    else if (argument === '--port' || argument === '--host') {
      if (!args.length || args[0].startsWith('--')) throw new Error(`${argument} needs a value.`);
      parsed[argument.slice(2)] = args.shift();
    } else if (argument.startsWith('--port=') || argument.startsWith('--host=')) {
      const split = argument.indexOf('='); parsed[argument.slice(2, split)] = argument.slice(split + 1);
    } else throw new Error(`Unknown option: ${argument}`);
  }
  parsed.port = Number(parsed.port || process.env.PORT || (parsed.dev ? 4173 : 8788));
  parsed.host ||= process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(parsed.port) || parsed.port < 1024 || parsed.port > 65535) throw new Error('Choose a port from 1024 to 65535.');
  if (!['127.0.0.1', '0.0.0.0', 'localhost', '::1', '::'].includes(parsed.host)) throw new Error('Use a local host such as 127.0.0.1 or 0.0.0.0.');
  return parsed;
}

async function openWhenReady(url, worker) {
  for (let attempt = 0; attempt < 90 && worker.exitCode === null; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        const program = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
        const args = process.platform === 'win32' ? ['/d', '/c', 'start', '', url] : [url];
        const browser = spawn(program, args, { stdio: 'ignore', detached: true });
        browser.on('error', () => console.log(`Open ${url} in your browser.`));
        browser.unref();
        return;
      }
    } catch { /* The Pages emulator is still starting. */ }
    await new Promise(resolveTimer => setTimeout(resolveTimer, 500));
  }
}

async function main() {
  requireNode();
  const settings = options();
  if (settings.help) {
    console.log('npm start [-- --open --port 8788 --host 127.0.0.1]\nnpm run dev [-- --port 4173]\n\nOptional local preview: npm install, npm run setup, npm start.\nServes Cloudflare Pages with a local D1 database. No Cloudflare login is needed.\nBuilds dist only when absent; run npm run build after source changes.');
    return;
  }
  if (!await exists(resolve(root, 'dist/_worker.js'))) {
    await command(process.execPath, [resolve(root, 'scripts/build.mjs')], { label: 'Build' });
  }
  if (!await exists(resolve(root, '.dev.vars'))) console.log('No local PIN is set. Run npm run setup to unlock this local preview.');
  const cli = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
  if (!await exists(cli)) throw new Error('Dependencies are missing. Run npm install first.');
  const urlHost = ['0.0.0.0', '::'].includes(settings.host) ? '127.0.0.1' : settings.host === '::1' ? '[::1]' : settings.host;
  const url = `http://${urlHost}:${settings.port}`;
  console.log(`\nLocal Cuebase: ${url}\nThis local database is separate from your live shared library.\nKeep this terminal open; press Ctrl+C to stop.\n`);
  const worker = spawn(process.execPath, [cli,
    'pages', 'dev', 'dist', '--ip', settings.host, '--port', String(settings.port), '--inspector-port', '0',
    '--compatibility-date', '2026-11-21', '--d1', 'DB=00000000-0000-0000-0000-000000000000',
    '--binding', 'PROMPTA_ALLOW_INSECURE_LOCAL_DEV=true', '--persist-to', localDataPath], {
    cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: 'inherit', shell: false,
  });
  worker.on('error', error => { console.error(error.message); process.exitCode = 1; });
  const stop = signal => { if (worker.exitCode === null) worker.kill(signal); };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  worker.on('close', code => { process.exitCode = code ?? 0; });
  if (settings.open) void openWhenReady(url, worker);
}

main().catch(error => { console.error(`\n${error.message}`); process.exitCode = 1; });
