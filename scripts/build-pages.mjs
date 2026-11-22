import { build } from 'esbuild';
import { resolve } from 'node:path';
import { root } from './config.mjs';

// Bundle server code separately from Vite. Runtime secrets are read from env
// inside Pages Functions; no build-time environment values are substituted.
export async function buildPages(outputDirectory = resolve(root, 'dist')) {
  await build({
    entryPoints: [resolve(root, 'worker/pages.ts')],
    outfile: resolve(outputDirectory, '_worker.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    sourcemap: false,
    legalComments: 'none',
  });
}
