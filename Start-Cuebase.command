#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Local preview needs Node.js 22.12 or newer from https://nodejs.org.' 'For your live website, follow START_HERE.txt.'
  exit 1
fi
if [ ! -f node_modules/wrangler/bin/wrangler.js ]; then
  npm install || exit 1
fi
npm run setup || exit 1
node scripts/serve.mjs --open
