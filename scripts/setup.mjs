#!/usr/bin/env node
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, requireNode, saveSetup, secretsPath, statePath } from './config.mjs';

export function hashPin(pin, salt = randomBytes(16)) {
  if (!/^[0-9]{6,12}$/.test(pin)) throw new Error('Choose a PIN containing 6 to 12 digits. Leading zeros are kept.');
  const derived = pbkdf2Sync(pin, salt, 100_000, 32, 'sha256');
  return `pbkdf2-sha256:100000:${salt.toString('base64url')}:${derived.toString('base64url')}`;
}

// Used by isolated local verification. No default PIN is supplied or saved.
export async function initializeSetup({ pin, workerName = 'prompta', backups = true }) {
  if (await readJson(statePath, true)) throw new Error('Setup already exists. Use npm run setup to update it without replacing its workspace identity.');
  const state = {
    format: 1, workerName, databaseName: `${workerName}-library`,
    workspaceId: `shared:${randomUUID()}`, backups,
    backupBucketName: `${workerName}-backups`,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const secrets = { PROMPTA_PIN_HASH: hashPin(pin), PROMPTA_SESSION_SECRET: randomBytes(32).toString('base64url') };
  await saveSetup(state, secrets);
  return { workspaceId: state.workspaceId };
}

async function ask(label, fallback = '') {
  const prompt = createInterface({ input: stdin, output: stdout });
  try { return (await new Promise(answer => prompt.question(`${label}${fallback ? ` [${fallback}]` : ''}: `, answer))).trim() || fallback; }
  finally { prompt.close(); }
}

async function askYesNo(label, fallback) {
  while (true) {
    const result = (await ask(`${label} ${fallback ? '(Y/n)' : '(y/N)'}`, fallback ? 'y' : 'n')).toLowerCase();
    if (['y', 'yes'].includes(result)) return true;
    if (['n', 'no'].includes(result)) return false;
    console.log('Enter y or n.');
  }
}

export function askPin(label) {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('PIN setup needs an interactive terminal. Run npm run setup there; PIN values are not accepted in arguments or frontend variables.');
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
    console.log('npm run setup\n\nChoose a Worker name, optional daily R2 backups, and a private 6–12 digit PIN.\nSetup writes local configuration only; it does not log in, create cloud resources, or publish.\nRun again to change the PIN. No PIN argument or environment variable is accepted.');
    return;
  }
  if (process.argv.length > 2) throw new Error('Unknown option. Use npm run setup or npm run setup -- --help.');
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Run npm run setup in an interactive terminal to choose your PIN securely.');
  const previous = await readJson(statePath, true);
  const previousSecrets = await readJson(secretsPath, true);
  console.log('\nPrompta setup\nChoose the shared library configuration. Nothing is published by this command.\n');
  let workerName;
  if (previous?.lastDeployedAt || previous?.provisioningWorker) {
    workerName = previous.workerName;
    console.log(`Worker name: ${workerName} (existing installation)`);
  } else do {
    workerName = await ask('Worker name (3–48 lowercase letters, digits or hyphens; start with a letter)', previous?.workerName || 'prompta');
    if (!/^[a-z][a-z0-9-]{2,47}$/.test(workerName)) console.log('Use a name such as prompta or prompta-studio.');
  } while (!/^[a-z][a-z0-9-]{2,47}$/.test(workerName));
  const backups = await askYesNo('Enable daily R2 backups? Requires R2 in your Cloudflare account', previous?.backups ?? true);
  const state = {
    ...previous,
    format: 1,
    workerName,
    databaseName: previous?.databaseId || previous?.provisioningDatabase ? previous.databaseName : `${workerName}-library`,
    workspaceId: previous?.workspaceId || `shared:${randomUUID()}`,
    backups,
    backupBucketName: previous?.backupProvisioned || previous?.provisioningBackup ? previous.backupBucketName : `${workerName}-backups`,
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  let secrets = previousSecrets;
  if (!previousSecrets || await askYesNo('Change the existing PIN and invalidate previous sessions after launch?', false)) {
    while (true) {
      const pin = await askPin('Shared PIN (6–12 digits)');
      if (!/^[0-9]{6,12}$/.test(pin)) { console.log('Use 6 to 12 digits. Leading zeros are kept.'); continue; }
      const confirmation = await askPin('Confirm PIN');
      if (pin !== confirmation) { console.log('The PINs did not match. Try again.'); continue; }
      secrets = { PROMPTA_PIN_HASH: hashPin(pin), PROMPTA_SESSION_SECRET: randomBytes(32).toString('base64url') };
      break;
    }
  }
  await saveSetup(state, secrets);
  console.log('\nSetup saved. Your PIN was not stored; the server uses a salted hash.\n\nPublish the shared library: npm run launch\nTry it only on this computer: npm start\n\nKeep .prompta and .dev.vars private. Keep the workspace ID when updating this installation.\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(`\n${error.message}`); process.exitCode = 1; });
}
