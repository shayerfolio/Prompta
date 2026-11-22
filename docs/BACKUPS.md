# Backups and recovery

## Included in the standard Pages setup

Use **Settings → Data & backups → Export library** to download the shared library. Keep an exported copy somewhere independent of the app. **Import JSON** previews records and duplicate handling before changing the library. Existing Prompta exports remain compatible with Cuebase.

An export includes library records, organization, retained history, settings and tombstones. It excludes PINs, session secrets/cookies, rate limits, local drafts, pending outbox operations and local conflict archives. Export needs a connected synchronized session so it can retrieve shared history.

Cross-device sync and local browser cache are not independent backups: a synced deletion can reach other devices.

## Scheduled snapshots

**This Pages package does not enable scheduled backups.** Its server exports only an HTTP handler. An R2 binding alone does not create a schedule. The app displays actual cloud snapshot status only when available, with no promise that a schedule is active.

The existing `worker/backups.ts` implementation remains available for an optional, separately deployed scheduled Worker. It writes timestamped private R2 JSON snapshots, records a base64url SHA-256 checksum, keeps thirty days after successful writes, and checks the 25 MiB / 50,000-record limit before loading the snapshot. Failures retain the previous recoverable snapshot. Tests cover the backup implementation; they do not verify a production schedule.

If an older Prompta Worker already has a working R2 schedule, keep it until a backup-only replacement is configured and checked. That old app has independent PIN settings; it should not remain a second public library indefinitely. The deployment log supplied for this project showed D1 and assets but no R2 binding, so an active R2 snapshot job has not been established from that log.

## Restore a JSON export

1. Keep a copy of the current library if it is accessible.
2. Unlock Cuebase and choose **Import JSON**.
3. Review the records and choose whether to skip duplicates or import copies.
4. Confirm, let sync finish, and check a few prompts and histories on another device.

Import merges reviewed records. It is not a whole-database point-in-time rollback, and it never applies tombstones as deletion instructions.

## Source update backups

The Windows updater saves replaced project code under `.cuebase/update-backups/` in the local repository. These are code backups only; the live D1 database and browser data are separate. The updater does not delete either.
