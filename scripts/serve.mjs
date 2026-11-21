#!/usr/bin/env node
/** Local Worker, D1 and PIN access. This command never deploys to Cloudflare. */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { configPath, exists, loadSetup, localDataPath, npm, requireNode, root, wrangler, writeConfiguration } from './config.mjs';

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
  parsed.port = Number(parsed.port || process.env.PORT || process.env.PROMPTA_PORT || (parsed.dev ? 4173 : 8787));
  parsed.host ||= process.env.HOST || (parsed.dev ? '0.0.0.0' : '127.0.0.1');
  if (!Number.isInteger(parsed.port) || parsed.port < 1024 || parsed.port > 65535) throw new Error('Choose a port from 1024 to 65535.');
  if (!['127.0.0.1', '0.0.0.0', 'localhost', '::1', '::'].includes(parsed.host)) throw new Error('Use a local host such as 127.0.0.1 or 0.0.0.0.');
  return parsed;
}

async function openWhenReady(url, worker) {
  for (let attempt = 0; attempt < 90 && worker.exitCode === null; attempt++) {
    try {
      const response = await fetch(`${url}/api/session`, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) {
        const command = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
        const args = process.platform === 'win32' ? ['/d', '/c', 'start', '', url] : [url];
        const browser = spawn(command, args, { stdio: 'ignore', detached: true });
        browser.on('error', () => console.log(`Open ${url} in your browser.`));
        browser.unref();
        return;
      }
    } catch { /* The local Worker is still starting. */ }
    await new Promise(resolveTimer => setTimeout(resolveTimer, 500));
  }
}

async function main() {
  requireNode();
  const settings = options();
  if (settings.help) {
    console.log('npm start [-- --open --port 8787 --host 127.0.0.1]\nnpm run dev [-- --port 4173 --host 0.0.0.0]\n\nRequires npm install and npm run setup. Runs local D1 migrations, then the Worker and built assets.\nBuilds dist only when absent; run npm run build after source changes. Nothing is published.');
    return;
  }
  const { state, secrets } = await loadSetup();
  await writeConfiguration(state, secrets);
  if (!await exists(resolve(root, 'dist/index.html'))) await npm(['run', 'build'], { label: 'Build' });
  await wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', localDataPath, '--config', configPath], { env: { CI: 'true' }, label: 'Local database migration' });
  const urlHost = ['0.0.0.0', '::'].includes(settings.host) ? '127.0.0.1' : settings.host === '::1' ? '[::1]' : settings.host;
  const url = `http://${urlHost}:${settings.port}`;
  console.log(`\nLocal Prompta: ${url}\nEnter the PIN you chose during setup. This local database is separate from the deployed shared library.\nKeep this terminal open; press Ctrl+C to stop.\n`);
  const worker = spawn(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'),
    'dev', '--local', '--ip', settings.host, '--port', String(settings.port), '--inspector-port', '0',
    '--persist-to', localDataPath, '--config', configPath], {
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
