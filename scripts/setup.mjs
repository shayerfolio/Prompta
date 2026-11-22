#!/usr/bin/env node
/** Optional local preview only. Hosted setup is done in the Pages dashboard. */
import { emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireNode, root, writePrivate } from './config.mjs';

export function askPin(label) {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Run npm run setup in an interactive terminal to choose a local PIN.');
  return new Promise((resolvePin, reject) => {
    let value = '';
    const previousRaw = stdin.isRaw;
    emitKeypressEvents(stdin);
    stdout.write(`${label}: `);
    stdin.setRawMode(true);
    stdin.resume();
    const finish = (error) => {
      stdin.off('keypress', onKey);
      stdin.setRawMode(previousRaw);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error); else resolvePin(value);
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) { finish(new Error('Setup canceled.')); return; }
      if (key.name === 'return' || key.name === 'enter') { finish(); return; }
      if (key.name === 'backspace' || key.name === 'delete') {
        if (value.length) { value = value.slice(0, -1); stdout.write('\b \b'); }
        return;
      }
      if (!key.ctrl && !key.meta && text && !/[\x00-\x1F\x7F]/.test(text) && value.length < 256) {
        value += text;
        stdout.write('*'.repeat(text.length));
      }
    };
    stdin.on('keypress', onKey);
  });
}

async function main() {
  requireNode();
  if (process.argv.includes('--help')) {
    console.log('npm run setup\n\nOptional: choose a 6–12 digit PIN for local preview on this computer.\nFor your live website, set the Secret PIN and the D1 binding DB in Cloudflare Pages.\nThis command never logs in, creates cloud resources, or publishes a website.');
    return;
  }
  if (process.argv.length > 2) throw new Error('Unknown option. Use npm run setup or npm run setup -- --help.');
  console.log('\nCuebase local preview\nThis PIN is only for this computer. Set your live PIN in Cloudflare Pages.\n');
  for (;;) {
    const pin = await askPin('Local PIN (6–12 digits)');
    if (!/^[0-9]{6,12}$/.test(pin)) { console.log('Use 6 to 12 digits. Leading zeros are kept.'); continue; }
    if (pin !== await askPin('Confirm local PIN')) { console.log('The PINs did not match. Try again.'); continue; }
    await writePrivate(resolve(root, '.dev.vars'),
      '# Local preview secret. Do not commit or upload this file.\n' +
      `PIN=${JSON.stringify(pin)}\nPROMPTA_ALLOW_INSECURE_LOCAL_DEV="true"\n`);
    break;
  }
  console.log('\nLocal PIN saved. Run npm start to open Cuebase on this computer.\nThe local database is separate from your live shared library.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(`\n${error.message}`); process.exitCode = 1; });
}
