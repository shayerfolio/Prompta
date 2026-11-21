#!/usr/bin/env node
/** Explicit Cloudflare publication. Never invoked by setup or local preview. */
import { createInterface } from 'node:readline/promises';
import { configPath, loadSetup, npm, requireNode, saveSetup, wrangler } from './config.mjs';

function decodeJson(output, label) {
  try { return JSON.parse(output.trim()); }
  catch { throw new Error(`${label} did not return readable JSON. Update the installed dependencies or check Cloudflare access, then retry.`); }
}

async function chooseAccount(state) {
  let result = await wrangler(['whoami', '--json'], { capture: true, allowFailure: true });
  if (result.code !== 0) {
    console.log('Sign in to your Cloudflare account in the browser opened by Wrangler.');
    await wrangler(['login'], { label: 'Cloudflare login' });
    result = await wrangler(['whoami', '--json'], { capture: true });
  }
  const identity = decodeJson(result.stdout, 'Cloudflare login');
  const accounts = Array.isArray(identity.accounts) ? identity.accounts : [];
  const requested = state.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
  if (requested) {
    if (!accounts.some(account => account.id === requested)) throw new Error('The saved Cloudflare account is not available to this login. Sign in to the original account; the library was not moved.');
    return requested;
  }
  if (accounts.length === 1) return accounts[0].id;
  if (!accounts.length) throw new Error('No Cloudflare account is available. Create an account at https://dash.cloudflare.com/, then run npm run launch again.');
  if (!process.stdin.isTTY) throw new Error('More than one Cloudflare account is available. Run launch in an interactive terminal to select one.');
  console.log('\nChoose the Cloudflare account for this installation:');
  accounts.forEach((account, index) => console.log(`${index + 1}. ${account.name} (${account.id})`));
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const selected = Number(await prompt.question('Account number: '));
      if (Number.isInteger(selected) && accounts[selected - 1]) return accounts[selected - 1].id;
      console.log('Enter one of the listed numbers.');
    }
  } finally { prompt.close(); }
}

async function ensureDatabase(state, secrets, env) {
  const list = async () => {
    const result = await wrangler(['d1', 'list', '--json', '--config', configPath], { capture: true, env, label: 'List D1 databases' });
    const databases = decodeJson(result.stdout, 'D1 list');
    if (!Array.isArray(databases)) throw new Error('Cloudflare returned an unexpected database list.');
    return databases;
  };
  let databases = await list();
  if (state.databaseId) {
    if (!databases.some(database => database.uuid === state.databaseId)) throw new Error('The saved D1 database was not found in this account. Restore the correct configuration; launch will not silently create a replacement library.');
    return;
  }
  let database = databases.find(item => item.name === state.databaseName);
  if (database && !state.provisioningDatabase) throw new Error(`A D1 database named ${state.databaseName} already exists. Restore the original .prompta configuration to use that installation, or run setup with a unique Worker name.`);
  if (!database) {
    state.provisioningDatabase = true;
    await saveSetup(state, secrets);
    await wrangler(['d1', 'create', state.databaseName, '--no-update-config', '--config', configPath], { env, label: 'Create D1 database' });
    databases = await list();
    database = databases.find(item => item.name === state.databaseName);
  }
  if (!database?.uuid) throw new Error('D1 was created but its ID could not be read. Run launch again to resume.');
  state.databaseId = database.uuid;
  delete state.provisioningDatabase;
  await saveSetup(state, secrets);
}

async function checkWorkerName(state, env) {
  if (state.lastDeployedAt || state.provisioningWorker) return;
  const result = await wrangler(['deployments', 'list', '--json', '--name', state.workerName, '--config', configPath], { capture: true, allowFailure: true, env });
  if (result.code === 0) throw new Error(`A Worker named ${state.workerName} already exists in this account. Launch stopped before changing it. Restore the original installation configuration, or run setup with a unique Worker name.`);
  // Only Wrangler's explicit Worker-not-found API codes establish absence.
  // Permission, connection and other errors must never authorize an overwrite.
  if (!/code["']?\s*[:=]\s*(?:10007|10090)\b/i.test(result.stderr + result.stdout)) {
    throw new Error(`Could not verify that the Worker name is unused. Check Cloudflare access before retrying.\n${result.stderr || result.stdout}`);
  }
}

async function ensureBackups(state, secrets, env) {
  if (!state.backups) return;
  const result = await wrangler(['r2', 'bucket', 'info', state.backupBucketName, '--json', '--config', configPath], { capture: true, allowFailure: true, env });
  if (result.code === 0 && !state.backupProvisioned && !state.provisioningBackup) {
    throw new Error(`An R2 bucket named ${state.backupBucketName} already exists. Restore the original installation configuration or choose a unique Worker name in setup. Existing bucket privacy settings will not be changed.`);
  }
  if (result.code !== 0) {
    if (state.backupProvisioned) throw new Error('The configured backup bucket is unavailable. Check R2 access before retrying; existing backups were not replaced.');
    state.provisioningBackup = true;
    await saveSetup(state, secrets);
    console.log('Creating the private R2 backup bucket. R2 must be enabled in your Cloudflare account.');
    await wrangler(['r2', 'bucket', 'create', state.backupBucketName, '--no-update-config', '--config', configPath], { env, label: 'Create R2 bucket' });
  }
  state.backupProvisioned = true;
  delete state.provisioningBackup;
  await saveSetup(state, secrets);
}

async function main() {
  requireNode();
  if (process.argv.includes('--help')) {
    console.log('npm run launch\n\nPublishes Prompta to your Cloudflare account after npm run setup.\nBuilds the app, signs in if needed, creates/reuses its D1 database, applies remote migrations,\noptionally creates private R2 backup storage, uploads server secrets through stdin, and deploys.\nThis is a real deployment command. To inspect locally, use npm start.');
    return;
  }
  if (process.argv.length > 2) throw new Error('Unknown option. Use npm run launch or npm run launch -- --help.');
  const { state, secrets } = await loadSetup();
  console.log(`\nPublishing ${state.workerName} to Cloudflare.\nDatabase: ${state.databaseName}\nDaily R2 backups: ${state.backups ? state.backupBucketName : 'not configured'}\n`);
  await npm(['run', 'build'], { label: 'Build' });
  state.accountId = await chooseAccount(state);
  await saveSetup(state, secrets);
  const env = { CLOUDFLARE_ACCOUNT_ID: state.accountId, CI: 'true' };
  await checkWorkerName(state, env);
  await ensureDatabase(state, secrets, env);
  await wrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', configPath], { env, label: 'Remote database migration' });
  await ensureBackups(state, secrets, env);
  console.log('Uploading the PIN hash and session secret securely.');
  state.provisioningWorker = true;
  await saveSetup(state, secrets);
  // Wrangler reads this JSON from stdin. No secret is in argv, shell history or console output.
  // On a first launch Wrangler creates an empty draft Worker before storing its secrets.
  const uploadedSecrets = { PROMPTA_PIN_HASH: secrets.PROMPTA_PIN_HASH, PROMPTA_SESSION_SECRET: secrets.PROMPTA_SESSION_SECRET };
  await wrangler(['secret', 'bulk', '--config', configPath], { input: JSON.stringify(uploadedSecrets), sensitive: true, env });
  console.log('Deploying the Worker and built app.');
  const deployment = await wrangler(['deploy', '--config', configPath], { capture: true, env, label: 'Cloudflare deployment' });
  process.stdout.write(deployment.stdout);
  if (deployment.stderr) process.stderr.write(deployment.stderr);
  const urls = deployment.stdout.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/gi) || [];
  const url = urls.find(value => new URL(value).hostname.startsWith(`${state.workerName}.`)) || urls[0];
  state.lastDeployedAt = new Date().toISOString();
  delete state.provisioningWorker;
  if (url) state.deployedUrl = url;
  await saveSetup(state, secrets);
  console.log(`\nDeployment complete.${url ? ` Open ${url}` : ' Open the deployment URL shown above.'}\nEnter your PIN on each device to open the same shared library.\nLocal preview records stay local; export and import them explicitly if needed.\n`);
  if (state.backups) console.log('Automatic backups are configured. Settings reports the first successful snapshot after the scheduled job actually runs.');
}

main().catch(error => { console.error(`\n${error.message}\nLaunch stopped. Completed resources are retained; rerun npm run launch after fixing the issue.`); process.exitCode = 1; });
