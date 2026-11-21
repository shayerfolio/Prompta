# Deployment and updates

## Deployment boundary

Prompta 0.7 runs as one Cloudflare Worker with static assets, D1 and optional R2. The app calls same-origin `/api/*`; the Worker verifies PIN sessions before reading or writing the shared library. A static Pages upload alone is insufficient.

No production deployment was performed during this delivery. `npm run setup` writes local files only. **`npm run launch` is the explicit publication command.** The shared workspace becomes available across devices only after that command successfully deploys to your account.

## Launch

Follow [SETUP.md](SETUP.md), then run:

```bash
npm run launch
```

The script:

1. Type-checks the frontend/Worker and builds the frontend.
2. Checks Cloudflare authentication and selects an account if needed.
3. Refuses to overwrite an unrelated existing Worker name on first launch.
4. Creates or uses this installation's D1 database, saves its ID and applies remote migrations.
5. Creates the optional private R2 bucket and saves its provisioning state.
6. Sends the PIN hash and session secret to Wrangler's `secret bulk` command through stdin.
7. Deploys the Worker, asset bundle, bindings and daily cron configuration.

On the first launch, Wrangler's bulk-secret command can create an empty draft Worker before the application deployment. Setup state records that pending operation so retries can resume. If a later step fails, existing resources are retained, and the script exits with an error. Fix the reported issue and rerun launch. It never deletes a database or bucket during recovery.

The generated config is `wrangler.config.json`; launch does not use the placeholders in the tracked template. The local-only HTTP exception is in `.dev.vars` and is not uploaded. The production API requires HTTPS.

Keep the printed URL and use it on every device. If you add a custom domain through Cloudflare, retain the same Worker, bindings and workspace ID. Browser caches belong to an origin, so the first visit on the custom domain must unlock and download the shared library. Export unsynced work from the previous origin before moving.

## Installation state

Keep `.prompta/setup.json` and the server secrets private and backed up. They establish which database/workspace an update belongs to. The scripts preserve provisioned identifiers and stop if those resources are unexpectedly missing. Recover the original configuration instead of generating a new workspace for an existing database.

A new installation name must be unique in the chosen account. Before first provisioning, rerunning setup can change its derived resource names. After a Worker has been deployed or provisioned, setup retains its name. Renaming/moving an active installation is a separate migration.

No raw PIN appears in CLI arguments, the frontend or tracked configuration. Launch uploads only `PROMPTA_PIN_HASH` and `PROMPTA_SESSION_SECRET`. Cloudflare login credentials are handled by Wrangler, not stored in Prompta's source.

## Update

Keep the existing generated installation files. Replace/update source without deleting `.prompta` or the generated config, install dependencies, run the tests and launch:

```bash
npm install
npm test
npm run launch
```

Launch builds again and applies only outstanding migrations. Changing the PIN requires setup first; keeping the current PIN leaves session secrets unchanged. New frontend assets are precached by the service worker. Finish drafts, close old tabs and reopen after an update; do not force-refresh an active editor.

If you disabled R2 during setup and then launch, the Worker no longer binds the backup bucket. Existing objects are retained; new snapshots stop. Re-enabling the option reuses this installation's saved bucket. Settings distinguishes not configured, awaiting a first snapshot, a verified timestamp and errors.

## Release checks after deployment

Use a new browser profile and a second device to check PIN unlock, incorrect PIN, lock/reload, record creation, copy, edit, shared settings, synchronization, version history, import/export and conflicting edits. Confirm record APIs reject requests without a valid cookie. Confirm expired/revoked sessions return to unlock.

Check a previously unlocked device offline, then reconnect and verify queued edits. A new/locked device must not unlock offline. Verify the service worker's returning offline app shell on the actual HTTPS origin.

For R2, wait for an actual scheduled snapshot, verify the status timestamp and perform the recovery drill in [BACKUPS.md](BACKUPS.md). A successful app deployment does not prove that a scheduled job ran or that a snapshot is recoverable.

Platform limits and charges depend on your account and usage. Review [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [R2 pricing](https://developers.cloudflare.com/r2/pricing/). There is no built-in spending-cap guarantee.

## Rollback

Keep a known-good source/build and a manual library export before an update. Cloudflare deployment history can restore earlier Worker code, but it does not restore D1 data or undo migrations. Confirm schema compatibility before rolling back. A whole-database replacement requires an explicit migration plan for current records, outbox mutations and client caches; normal import deliberately avoids destructive replacement.

## Official references

- [Worker static-asset binding and API routing](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Wrangler deployment and secrets commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
- [Server secrets and local development files](https://developers.cloudflare.com/workers/configuration/secrets/)
- [D1 creation and migrations](https://developers.cloudflare.com/workers/wrangler/commands/d1/)
- [R2 commands](https://developers.cloudflare.com/workers/wrangler/commands/r2/)
