# Setup and migration

## Requirements

Use Node.js **22.12 or newer**, npm and a terminal. Publishing requires your own [Cloudflare account](https://dash.cloudflare.com/). Wrangler opens its browser login when needed. This is deployment administration; people using Prompta enter its shared PIN and do not sign in to Cloudflare or Google.

Cloudflare must allow Workers and D1 in your account. If you choose automatic backups, enable R2 first. Review current [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/) and [R2](https://developers.cloudflare.com/r2/pricing/) plan limits/pricing; the application does not promise unlimited free hosting.

## Three commands

From the extracted project folder:

```bash
npm install
npm run setup
npm run launch
```

`setup` asks for:

| Input | Meaning |
|---|---|
| Worker name | A unique name in your Cloudflare account; 3–48 lowercase letters, digits or hyphens, starting with a letter |
| Daily R2 backups | Whether launch should create private R2 snapshot storage |
| Shared PIN | 6–12 digits, entered twice with masked input; leading zeros remain part of the PIN |

Setup derives PBKDF2-SHA256 with a fresh 16-byte salt and 100,000 iterations. It stores the resulting hash, generates a random 32-byte session secret and chooses a stable `shared:<UUID>` workspace ID. No default PIN is supplied. Raw PINs are neither saved nor printed, and the script does not accept a PIN command-line flag.

**Setup makes no Cloudflare changes. Launch performs the deployment.** Launch builds first, checks Cloudflare access and the Worker name, creates/migrates D1, optionally creates R2, uploads only the two server secrets through stdin, and deploys the Worker and `dist` together. It preserves resource IDs for later runs. A name already belonging to an unrelated Worker/database/bucket stops the first launch instead of overwriting it.

Open the URL printed by Cloudflare and enter the PIN. Use that same URL on each device. The workspace is shared; there are no separate personal accounts or permission levels.

## Files produced by setup

| File | Contents and handling |
|---|---|
| `.prompta/setup.json` | Worker/database/bucket names, workspace ID, selected account and provisioned resource IDs. Preserve for updates. |
| `.prompta/secrets.json` | Server-only PIN hash and session secret. Keep private. |
| `.dev.vars` | Local Worker secrets and a loopback-only HTTP development flag. Never deploy as a frontend file. |
| `wrangler.config.json` | Generated binding/variable configuration used by launch and local start. Contains no PIN or session secret. |
| `.prompta/local-state` | Persistent local D1/R2 development data after local start. Separate from production. |

These files are ignored by version control. The scripts request restrictive filesystem permissions where supported; this is not encryption. Keep them out of ZIP/source distributions. Store a secure copy of the installation configuration if you need to update from another computer. Deleting it and rerunning setup creates a new workspace identity; it does not reconnect an earlier installation automatically.

The tracked `wrangler.jsonc` is a template. Do not deploy its placeholder database ID directly. `.env.example` explains that no frontend key is needed. Never add the PIN/hash/session secret to `VITE_*` variables: Vite makes such values public in the built frontend.

## Local use before publishing

After install/setup, use:

```bash
npm start
```

Open `http://127.0.0.1:8787`. The script applies **local** D1 migrations and serves the same Worker/PIN APIs and built frontend. It creates no remote resources. The included desktop launchers call this path, installing dependencies and running setup if missing.

For a local development preview, `npm run dev` uses port 4173. `--port`, `--host` and `--strictPort` are accepted, as is `PORT`. The built app is served from `dist`; run `npm run build` after changes. A build is performed automatically only if `dist/index.html` is absent.

Local data is not production data. Keep the same address/browser for cache continuity, and explicitly export/import any local records you want in the deployed workspace. Do not use a static-only server for the default build; missing API access produces a setup error instead of an unprotected local workspace.

## Change the PIN

Run `npm run setup` again, choose to change the existing PIN, then run `npm run launch` to apply it to the deployed Worker. Setup keeps the existing workspace/database and rotates the session secret. Existing server sessions become invalid. Without launching, the production PIN is unchanged; restarting the local server uses the updated local configuration.

A remote change cannot erase records already cached on an offline device. Those caches are not independently encrypted. Use **Lock** on a device before handing it to someone else, and only share the PIN with people who should have full access.

## Move an existing library

### Earlier local records in this browser and origin

1. Keep the existing browser/site data. Unlock the new shared workspace.
2. Open **Settings → Data & backups**.
3. If **Existing prompts on this device** appears, choose **Review import**.
4. Review counts and warnings. Choose **Skip duplicates** or **Import copies**, then confirm.
5. Wait for synchronization and check the records from a second device after deployment.

The review reads the previous `local` IndexedDB partition. It copies records only after confirmation and leaves the source partition intact. Importing makes the selected records accessible to everyone with the shared PIN. It does not automatically inspect previous authenticated-owner partitions or another origin/browser.

### JSON export from another origin or earlier release

Keep the previous release and its browser data available. In that release, export the intended library while its original browser/origin and required session remain available. In the new release, unlock, choose **Import JSON**, review the preview and confirm. The schema remains Prompta version 1, and imported ownership is reassigned to the current shared workspace.

Skip mode preserves existing matching IDs without overwriting. Copy mode creates new IDs and remaps categories, tags, collections and versions. Existing preferences stay in place; deletion markers never execute deletes. Drafts and old pending/conflict internals are not migrated through library export. Complete earlier synchronization and resolve conflicts before exporting when possible.

Keep the old release/export until text, links, collection order and available history have been checked. If the earlier library cannot be opened, retain the original browser profile and release; do not clear its data or assume the new empty workspace means the old records were deleted.

## Troubleshooting

- **Setup requires an interactive terminal:** run it in a normal terminal; masked PIN input intentionally rejects piped/noninteractive input.
- **Missing dependencies:** run `npm install` in the project folder.
- **Name already exists:** restore the original installation configuration to update it, or choose a unique Worker name before first provisioning. Launch will not silently adopt another service.
- **Saved database/bucket unavailable:** check that Cloudflare login uses the original account and that the resource still exists. Do not replace its ID merely to suppress the error.
- **R2 creation fails:** enable R2 or rerun setup and disable optional backups, then launch again. Existing D1 data is retained.
- **PIN API/setup error:** use the Worker server and generated configuration; static hosting alone does not provide authentication or synchronization.
- **Too many PIN attempts:** wait for the server's retry window. The client cannot bypass it.

See [deployment](DEPLOYMENT.md) for updates and [backups](BACKUPS.md) for independent recovery.
