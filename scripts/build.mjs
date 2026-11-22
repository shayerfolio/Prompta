#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { buildPages } from './build-pages.mjs';
import { command, exists, requireNode, root } from './config.mjs';

async function main() {
  requireNode();
  for (const file of ['src/main.tsx', 'worker/pages.ts', 'worker/tsconfig.json', 'public/_routes.json']) {
    if (!await exists(resolve(root, file))) throw new Error(`Missing ${file}. Upload the complete Cuebase project, keeping its folders.`);
  }
  for (const file of ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml']) {
    if (await exists(resolve(root, file))) throw new Error(`Remove the old ${file} from the project and GitHub. Cuebase uses your Cloudflare Pages dashboard settings. Update-Cuebase.bat handles this when updating the existing repository.`);
  }
  const localOnly = loadEnv('production', root, 'VITE_').VITE_LOCAL_ONLY === 'true';
  if (localOnly && (process.env.CF_PAGES || process.env.CUEBASE_ALLOW_LOCAL_ONLY_BUILD !== 'true')) {
    throw new Error('Remove VITE_LOCAL_ONLY from your build settings. The published Cuebase app must use its PIN-protected shared library.');
  }
  await command(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--noEmit'], { label: 'Frontend type check' });
  await command(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', 'worker/tsconfig.json'], { label: 'Server type check' });
  await command(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build'], { label: 'Frontend build' });
  await buildPages();
  const serviceWorker = await readFile(resolve(root, 'dist/sw.js'), 'utf8');
  if (serviceWorker.includes('_worker.js')) throw new Error('The server bundle must not be included in the offline cache.');
  console.log('\nCuebase is ready for Cloudflare Pages: build command npm run build, output directory dist.');
}

main().catch(error => { console.error(`\n${error.message}`); process.exitCode = 1; });
