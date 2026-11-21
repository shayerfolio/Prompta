# Independent backups and recovery

## Operating status

Automatic snapshots require the deployed Worker and its optional R2 binding. **No production backup job was enabled or run during this delivery.** Local Worker/R2 tests verify the implementation in the scope recorded in [TEST_RESULTS.md](TEST_RESULTS.md); they do not establish a live schedule.

Choose daily R2 backups during `npm run setup`, then run `npm run launch` when you intend to publish. R2 must be enabled in your Cloudflare account. Settings reports **Not configured**, **Awaiting first backup**, an actual snapshot timestamp, or an error. A configuration flag never supplies a successful timestamp.

## Policy

| Item | Implemented behavior |
|---|---|
| Schedule | Daily at 03:00 Asia/Dhaka; Worker cron `0 21 * * *` uses UTC |
| Source | One consistent D1 read of the shared workspace's stored entities |
| Format | Plain Prompta schema-version-1 JSON with actual export timestamp |
| Contents | Prompts/templates, categories, tags, collections/order, retained history, settings, usage metadata and tombstones |
| Exclusions | PIN/hash/secrets, session cookies/rows, rate-limit records, local drafts, pending outbox operations and local conflict archives |
| Destination | Private R2 objects under `prompta-backups/<workspaceId>/` |
| Integrity | Base64url SHA-256 in object metadata and server backup status |
| Retention | Objects older than 30 days are removed only after a successful new snapshot |
| Bounds | 50,000 entities and 25 MiB JSON; failures are explicit |
| Monitoring | Last attempt/success/error in D1; app flags a last success older than 36 hours |

Snapshots are immutable timestamped files separate from live records. A failed attempt does not prune existing snapshots. Sync can propagate a deletion, whereas an earlier retained snapshot preserves the earlier content. The backup does not automatically restore anything.

The bucket stays private: launch does not create public bucket access or an app download endpoint. Do not enable a public R2 domain for this bucket. Cloudflare administrators still control the account/bucket, so keep periodic downloaded exports elsewhere if you need protection from an account-wide deletion.

## Enable and verify

1. Enable R2 in your Cloudflare account if needed. Review current [R2 pricing](https://developers.cloudflare.com/r2/pricing/) and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
2. Run setup and select daily R2 backups. Launch creates a private bucket or reuses this installation's already provisioned bucket, then binds it to the Worker.
3. Confirm the deployed Worker's cron is `0 21 * * *`. Cloudflare cron uses UTC; 21:00 UTC is the next day's 03:00 in Dhaka.
4. After a scheduled run, check the R2 object and Settings timestamp. A deployment success alone is insufficient.
5. Monitor failed scheduled invocations and the app's stale-success warning. The application does not install external email/alert subscriptions for you.
6. Complete the recovery drill below before depending on the schedule.

The daily cron also cleans expired server session/rate-limit entries when R2 is disabled. It is not the prompt recycle-bin expiry job; that remains client initialization/hourly maintenance.

To disable future snapshots, rerun setup with backups disabled and launch. Existing R2 objects remain. Re-enabling uses the saved bucket. Normal updates preserve the bucket, database and workspace ID.

## Download and check a snapshot

Use the authenticated Cloudflare R2 dashboard to select the private backup object and download it. Record its `sha256` custom metadata, or the matching checksum from the private D1 backup-status record. The checksum format is SHA-256 encoded as base64url without padding.

Alternatively, with Wrangler authenticated to the correct account, download an exact known key:

```bash
npx wrangler r2 object get "YOUR_BUCKET/YOUR_OBJECT_KEY" --remote --file recovered-library.json --config wrangler.config.json
```

Choose a new output filename so you do not overwrite an earlier recovery file. The command downloads only the named object; it does not apply the snapshot. To calculate the downloaded file's checksum without displaying its prompt contents:

```bash
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; console.log(createHash('sha256').update(readFileSync(process.argv[1])).digest('base64url'));" recovered-library.json
```

Compare that value with the saved object metadata. If they differ, retain the evidence and download again; do not import the altered file. The application's import preview independently validates the JSON schema and field bounds.

## Restore through the app

1. Export the current synchronized library first if it contains work you want to retain.
2. Unlock Prompta and open **Settings → Data & backups → Import JSON**.
3. Select the recovered JSON and review counts/warnings.
4. **Skip duplicates** leaves current matching IDs unchanged. **Import copies** creates separate records and remaps categories, tags, collections and history. Confirm after reviewing.
5. Inspect the recovered prompt text, references, collection order and retained versions, then wait for synchronization.

Existing preferences stay in place. Exported tombstones are never applied as deletes. This workflow recovers selected earlier content safely; it does not replace the entire live database with a historical state. A complete database rollback requires an explicit plan for devices, queued mutations, revisions and caches.

## Recovery drill

Create a temporary prompt and collection, edit the prompt, and wait for a real snapshot. Change or delete the live prompt. Download the earlier snapshot, verify its checksum and import copies. Confirm the earlier text, relationships and retained history are present, then remove only the temporary test records through the app.

Record the result and repeat after changes to the backup/deployment path. Local export/import tests and a local R2 snapshot test are useful evidence, but a live drill verifies your actual account permissions, schedule, bucket and recovery access.

## Official references

- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [R2 bucket and object commands](https://developers.cloudflare.com/workers/wrangler/commands/r2/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
