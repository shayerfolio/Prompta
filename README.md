# Prompta 0.7

Prompta stores one shared prompt library behind a PIN. Open the deployed URL on another device, enter the same PIN, and use the same library. The app has no Google sign-in or per-user account. Everyone with the PIN has the same access to its records.

The frontend uses React, TypeScript, Vite and IndexedDB. A Cloudflare Worker verifies the PIN, issues an HttpOnly session cookie and synchronizes records through D1. Optional R2 snapshots provide a separate backup. The latest [product revision](docs/UI_REVISION.md) supersedes the corresponding parts of the original brief.

## Install, set up, launch

Have Node.js **22.12 or newer** and a [Cloudflare account](https://dash.cloudflare.com/) ready. In the extracted project folder, run:

```bash
npm install
npm run setup
npm run launch
```

Setup asks for a unique Worker name, optional daily R2 backups and your **6–12 digit PIN**. PIN entry is masked and leading zeros are preserved. Setup saves a salted hash and random server session secret; it does not publish anything.

**Launch publishes the app.** It builds the frontend and Worker, opens Cloudflare login when necessary, creates the D1 database, applies migrations, creates the optional private R2 bucket, uploads server secrets through stdin and deploys the app. Cloudflare prints the URL. Use that URL on every device. A custom domain is optional.

R2 must be enabled in your Cloudflare account if you select automatic backups. Platform usage and plan limits still apply; see [setup](docs/SETUP.md), [deployment](docs/DEPLOYMENT.md) and [backups](docs/BACKUPS.md). No deployment, Cloudflare account provisioning or live scheduled backup was performed as part of this delivery.

### Try it only on this computer

After install and setup, run this **instead of launch**:

```bash
npm start
```

Open **http://127.0.0.1:8787** and enter your PIN. This runs the real Worker and a local D1 database; it never publishes or writes to the production database. `npm start -- --open` also opens the browser. The Windows and macOS launchers install missing dependencies, run setup when needed, and start this same local server.

The local database is separate from the deployed library. Records do not move to the cloud just because you later deploy. Export and explicitly import them if needed. Keep the same local address/browser profile for the same cache. Do not open `dist/index.html` directly or serve `dist` through a static-only server: the default app requires its PIN API.

## Main actions

A new workspace starts empty on **All prompts**. There is no Home dashboard or sample-data control. Old `?page=home` links also open All prompts.

- Create, edit, duplicate, favorite and organize prompts and templates.
- Click a card's main content or blank area in grid or list view to copy its exact original text, including placeholders and line breaks.
- Cards show the full title and prompt content. There is no Details button. **Variables** appears only on active records with placeholders and opens the variable form directly; ordinary copying preserves the original placeholders.
- Open **History** from a card's ellipsis menu to compare or restore revisions. In grid view, the **Size** slider adjusts card width from 240 to 560 pixels and remembers the choice on this device.
- Combine search with category, tag, collection, type and favorite filters. Choose library sorting or a collection's saved order.
- Manage categories, tags and collections. A collection references existing records; deleting it keeps those records.
- Recover interrupted drafts, compare retained revisions and restore earlier content. Creating, saving or duplicating does not automatically open a panel.
- Restore deleted prompts from the recycle bin, or confirm permanent deletion and Empty bin.
- Export a JSON library or review an import before applying it. Duplicate skipping preserves current records; importing copies remaps relationships.

Successful copy feedback follows actual clipboard success. HTML-looking prompt text is rendered as text. Mobile navigation contains **Prompts / Favorites / New / Collections**.

| Shortcut | Action |
|---|---|
| Ctrl / Cmd + K | Focus search |
| N outside a text field or modal | New prompt |
| Ctrl / Cmd + Enter | Save the editor |
| Escape | Close a dialog or history panel, with unsaved-change handling |
| ? outside text fields | Shortcut help |

## Moving an earlier library

Existing records are not automatically added to the shared workspace.

If this browser and origin contain the earlier browser-local library, unlock the new app and open **Settings → Data & backups → Existing prompts on this device → Review import**. Review the records, choose duplicate handling and confirm. The old local records remain available; the operation copies them into the shared workspace.

For a different browser/origin, a previous authenticated library, or an existing JSON backup, export from the previous release first and use **Import JSON** after unlocking this release. Keep the original release/export until the imported records and version history are verified. Do not clear browser storage during migration. See [migration instructions](docs/SETUP.md#move-an-existing-library).

## PIN access, offline use and synchronization

The server verifies the PIN and protects every record API. The PIN/hash/session secret is never embedded in the frontend. Production sessions use Secure, HttpOnly, SameSite cookies; the default session lifetime is seven days. **Lock** closes access on this device and revokes its server session when connected. Changing the PIN through setup and launching again invalidates previous server sessions.

A previously unlocked device can keep working with cached records while offline, within its remembered session lifetime. New or locked devices need a connection to unlock. A returning offline app visit also needs a previously installed production service worker. Offline data remains on the device; a remote PIN change cannot erase an already offline cache. IndexedDB is not an encrypted vault.

Writes commit to IndexedDB and a durable outbox before success is reported. The app retries pending changes when connected. D1 compares revisions and remembers mutation IDs, so retries do not blindly repeat changes. Divergent edits remain available for explicit conflict review. The client polls while visible and refreshes on focus/reconnection; synchronization is not instantaneous. “Synced” requires successful synchronization with no pending writes or unresolved conflicts.

Deleting browser/site data can lose unsynced work. Export requires a connected, synchronized session so it can include shared history. A local-only development build can be explicitly enabled by a developer, but it is not the default release and provides no shared-library guarantee.

## Data and recovery limits

The app retains the latest **20 meaningful revisions** per prompt and keeps soft-deleted records for **30 days**. Expired trash is cleaned on initialization and hourly while the app is open. Restoration keeps text/category/tags/history; removed collection memberships must be added again. Lightweight tombstones prevent stale devices from silently recreating deleted records.

Imports are limited to **25 MiB / 50,000 records**; an entity must be below **900 KiB** and a collection can reference at most **10,000 records**. Existing settings are preserved during import. Tombstones in an export are never applied as deletion instructions. Drafts, pending operations, authentication/session data and device-local conflict archives are not part of a normal library export.

Current records are cached in memory for offline full-content search. The interface pages results; this is not a remote full-text index or unlimited-library virtualization. API pages are bounded to 20 records even when the client requests a larger page.

Optional R2 snapshots run daily at **03:00 Asia/Dhaka (21:00 UTC)** and retain 30 days of successful backups. Settings reports actual server status, including “Awaiting first backup” until a snapshot exists. Sync and local browser persistence do not substitute for these snapshots or an independent exported copy.

## Develop and verify

```bash
npm test
npm run build
npm run dev
```

`build` type-checks the frontend and Worker and writes `dist`. `dev` runs one local Worker on port **4173**, with persistent local D1 and the built assets. It accepts `--port`, `--host` and `--strictPort`, or `PORT`. Rebuild after frontend changes; the wrapper only builds automatically when `dist` is absent. `npm start` and `npm run preview` use loopback port **8787** by default. Development does not deploy.

The executed checks and remaining environment-specific checks are in [TEST_RESULTS.md](docs/TEST_RESULTS.md). Historical logs for previous releases do not verify this Worker/PIN architecture. Production cross-device operation, a deployed scheduled backup and a real recovery drill require your deployment; they are not claimed as completed here.

## Project files

| Path | Purpose |
|---|---|
| `src/components`, `src/pages`, `src/App.tsx` | UI and PIN access boundary |
| `src/domain` | Shared models, validation, search and variables |
| `src/data` | IndexedDB repository, drafts, history, outbox and conflicts |
| `src/lib/cloud.ts` | Same-origin session and synchronization client |
| `worker` | PIN/session security, D1 records and independent backups |
| `migrations` | D1 schema migrations |
| `wrangler.jsonc` | Tracked deployment template, with no working credentials |
| `scripts` | Setup, local server and explicit launch |
| `docs` | Setup, deployment, architecture, recovery and verification |

`.prompta/`, `.dev.vars` and `wrangler.config.json` are generated private installation files and are ignored. Keep them out of source archives; preserve your installation configuration securely so updates use the same database and workspace ID. See [Architecture](docs/ARCHITECTURE.md) and the [Feature checklist](docs/FEATURE_CHECKLIST.md).

Android APK packaging and a Chrome extension remain outside this release. Their domain, storage and clipboard boundaries are separated for later clients.
