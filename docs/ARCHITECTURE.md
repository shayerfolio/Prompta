# Cuebase 0.8 architecture

## Hosting boundary

Cuebase uses a Git-connected Cloudflare Pages deployment. Vite builds the React frontend, then esbuild bundles the server adapter into `dist/_worker.js`. Pages advanced mode supplies `ASSETS` automatically. `_routes.json` invokes the server for `/api` and `/api/*`; other requests use static assets and Pages' built-in SPA fallback. There is no catch-all redirect file.

Cloudflare dashboard configuration is the source of truth. Production requires D1 binding `DB` and Secret `PIN`. Build scripts never substitute server secrets into client code. The supported Pages build refuses the local-only authentication bypass. The service worker excludes all API routes and the server bundle from caching/precache.

## Initialization and existing data

Before a configured API request reaches the existing data protocol, the server validates the dashboard PIN and database binding. It creates missing schema using additive `CREATE TABLE/INDEX IF NOT EXISTS` statements. No record, mutation receipt, cursor, history row or backup is rewritten during bootstrap.

The private `cuebase_configuration` row stores a stable workspace ID and a cryptographically random session secret. Initialization chooses the single existing workspace across records, mutation receipts, sessions and backup status, or creates a fresh ID for a genuinely empty database. An atomic insert ensures concurrent first requests agree. Several existing workspaces require an explicit validated `PROMPTA_WORKSPACE_ID`; the server does not guess. Once configuration exists, an inconsistent override fails closed.

A deterministic salt derived from the random server secret lets the dashboard PIN be converted to the existing PBKDF2 verifier in server memory. The plaintext PIN is not written into D1, exported or returned in API responses. Successful preparation is cached per D1 binding and relevant configuration. Failed preparation is retryable.

## Access

PINs contain 6–12 digits, including leading zeros. Verification uses PBKDF2-SHA256 with 100,000 iterations and a timing-safe comparison. Rate limiting is atomic in D1: eight attempts per IP and sixty globally per 15-minute window. Cloudflare's connecting-IP header is used; forwarded-IP headers supplied by the visitor are not trusted.

Sessions use random 256-bit opaque tokens. Only a keyed digest is stored in D1. HTTPS cookies are Secure, HttpOnly and SameSite=Strict, with a default seven-day lifetime. An authentication epoch depends on the current PIN verifier and secret, so a PIN change invalidates older sessions online. Exact same-origin checks protect state-changing requests. Local HTTP is allowed only on loopback with an explicit local development flag.

Successful unlocks clean up expired sessions and stale rate-limit rows; Pages needs no maintenance cron for those tables. Existing Worker hash-based configuration remains compatible in the core Worker for regression tests and advanced administration. The Pages adapter requires its dashboard `PIN` secret.

## Client and sync

React shows the PIN gate until a server session succeeds. The same-origin client uses `/api/session`, `/api/unlock`, `/api/lock`, `/api/records`, `/api/versions`, `/api/mutations` and `/api/backups`. Missing configuration returns a JSON error rather than silently opening a browser-local library.

IndexedDB partitions records by the workspace returned after authentication. Changes commit locally with a durable outbox before success is shown. D1 checks base revisions and mutation IDs in an atomic batch. Retries acknowledge an existing mutation; they do not roll back newer data. Concurrent edits produce explicit conflicts, including conflicts against deletion tombstones. Visible clients poll and also refresh on focus/reconnection; sync is not instantaneous.

Session generations guard late network responses, unlocks and export/history work. Locking closes editors and revokes the session when connected; cross-tab state closes other local views. An already unlocked device can use cached records offline within its remembered session lifetime. The cache is not encrypted and cannot be remotely erased by a PIN rotation.

## Compatibility and data limits

The user-facing brand and filenames are Cuebase. Existing `prompta:*` storage keys, cookie names, owner/workspace IDs, JSON `app: "Prompta"` marker and R2 prefix remain stable to protect compatibility. They are identifiers, not visible product branding.

Twenty meaningful revisions are retained per prompt. Trash expires after thirty days, with cleanup on app initialization and hourly while open. Tombstones prevent stale devices from recreating deleted records silently. Import supports reviewed duplicates/remapping, preserves existing settings, and never treats imported tombstones as deletion commands. Export synchronizes before retrieving retained shared history.

Import and optional snapshot bounds are 25 MiB and 50,000 records. Entities are below 900 KiB, prompt content is at most 200,000 characters, and collections can reference at most 10,000 records. API pages are bounded to twenty rows, and cursors advance across filtered version rows. Search uses locally cached current records rather than a remote full-text index.

## Backups

Manual JSON export/import remains part of the app. Pages exports only a fetch handler and does not register a scheduled handler. The legacy Worker backup implementation is retained for a separately configured scheduler and is tested independently. Merely attaching R2 to Pages does not schedule backups. See [BACKUPS.md](BACKUPS.md).

## Verification boundary

[TEST_RESULTS.md](TEST_RESULTS.md) records checks actually run. A local runtime test cannot confirm the bindings, secrets or live deployment in a user's Cloudflare account. This delivery changes no live resources.

Primary references: [Pages advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/), [routing](https://developers.cloudflare.com/pages/functions/routing/), [SPA behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/), [dashboard configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
