#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Prompta needs Node.js 22.12 or newer. Install it from https://nodejs.org/.'
  exit 1
fi
if [ ! -f node_modules/wrangler/bin/wrangler.js ]; then
  npm install || exit 1
fi
if [ ! -f .prompta/setup.json ]; then
  npm run setup || exit 1
fi
node scripts/serve.mjs --open
