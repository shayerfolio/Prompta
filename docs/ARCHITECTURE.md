# Prompta 0.7 architecture

## Boundaries

Prompta has one shared workspace per deployment. Its stable workspace ID comes from server configuration after PIN authentication. All people with that PIN see and modify the same prompts, organization and preferences. There are no Google accounts, per-user libraries or roles in this release.

| Layer | Responsibility |
|---|---|
| React UI | Navigation, prompt forms, copy/variables/history actions, PIN gate, status and recovery choices |
| Shared domain | Entity types, field validation, variable parsing/replacement and library filtering |
| IndexedDB repository | Atomic local persistence, workspace partitions, drafts, retained versions, durable outbox and conflicts |
| Same-origin cloud client | Session refresh, unlock/lock, incremental reads, queued writes and explicit conflict resolution |
| Cloudflare Worker | Server PIN verification, sessions, rate limiting, origin checks, D1 mutation protocol and R2 backup scheduling |
| D1 | Authoritative shared records, revision/mutation receipts, sessions, limits and backup status |
| Optional R2 | Independent timestamped JSON library snapshots |

The Worker serves the API and built static assets under one origin. Its asset configuration routes `/api/*` through the Worker before SPA fallback. The client does not connect directly to D1 or R2. Static-only hosting cannot provide the default application's PIN or synchronization API.

## Setup and secrets

`npm run setup` runs only on the operator's computer. It accepts a masked 6–12 digit PIN, preserves leading zeros, derives PBKDF2-SHA256 with a random 16-byte salt and 100,000 iterations, generates a random 32-byte session secret and saves a stable `shared:<UUID>` workspace ID. The versioned hash format is shared by setup and Worker verification.

Private generated files are ignored: `.prompta/setup.json`, `.prompta/secrets.json`, `.dev.vars` and `wrangler.config.json`. No PIN, hash or session secret is a Vite public variable. Launch uploads the two server secrets through stdin, provisions the configured D1/optional R2, applies migrations and deploys code/assets. Setup and local preview do not perform remote writes.

The local development flag permits HTTP only on loopback hostnames. It is placed in `.dev.vars` and omitted from deployment variables. Production requires HTTPS. Local D1 data is persisted under `.prompta/local-state`; it is independent of deployed D1.

## Access boundary

Every API request first checks required server configuration and transport. Mutating requests require the exact request origin and reject cross-site requests. Unlock has persistent D1 counters: at most 8 attempts per IP bucket and 60 attempts per shared workspace in a 15-minute window. IP bucket identifiers are HMAC-derived. Wrong PINs do not create sessions.

A correct PIN creates a random bearer token in a Secure, HttpOnly, SameSite=Strict, host-only cookie. D1 stores an HMAC of the token, its workspace, expiration and an authentication epoch derived from the current PIN hash/session secret. The default lifetime is seven days, configurable within the server's bounds. PIN or session-secret rotation invalidates earlier server sessions. The local loopback HTTP cookie is explicitly separate from the production cookie.

The UI calls `/api/session` before opening its workspace and keeps no PIN/session token in application storage. Lock clears the visible workspace and cached-session permission, closes other tabs through a storage signal and attempts server revocation. If offline, it records a local lock and completes revocation on reconnection. It does not silently reopen a locked cached session.

A previously unlocked device may reopen cached records during a network failure while its remembered session has not expired. This is an offline convenience, not local cryptographic protection. Cached IndexedDB data is not encrypted by the PIN, and a remote PIN rotation cannot erase an offline copy. New or explicitly locked devices must connect to unlock. Developer-only `VITE_LOCAL_ONLY=true` is an explicit separate mode; it is not an automatic fallback when the API is missing.

## Local commit and synchronization

Entities use a compound `[ownerId, id]` key locally. In this release `ownerId` is the shared workspace ID; legacy `local` and former authenticated partitions remain separate. Successful mutations commit the record and outbox entry in the same IndexedDB transaction. A failure does not report a saved result or replace usable data with a fatal route.

The outbox retains a stable mutation ID, base server revision and payload. Changes can coalesce before a mutation is claimed; a payload that may have been sent is immutable. Edits made during an upload become a following mutation. On startup, abandoned sending claims are released for retry.

The Worker validates every entity using the same domain rules and rejects another workspace's IDs. A D1 batch atomically inserts a receipt only if the current revision matches, writes the record for that attempt and returns the receipt/current record. The receipt includes a canonical payload hash. Reusing an ID for changed content is rejected; retrying a historical receipt does not overwrite a newer record. Divergent revisions return a conflict, including a synthetic absence tombstone when appropriate.

D1 mutation receipts assign monotonic cursors. The records table exposes the latest state for each record after a cursor. Ordinary reads skip version bodies while still advancing over them; history is fetched on demand. Responses are capped at 20 records to bound memory, and the client follows pagination until current. Visible clients refresh about every 10 seconds and on focus/reconnection. This is polling, not a pushed realtime subscription.

Incoming records are validated again before storage. Pending local edits are preserved. “Synced” means the pull/write cycle succeeded and no pending mutations or conflicts remain. A network outage or an authentication error is represented explicitly; failed writes stay in the outbox.

## Conflict and recovery semantics

Conflict review preserves both alternatives until a choice is committed. Local/cloud choices are available, and Save both is offered only for kinds where duplication is meaningful. Prompt alternatives can be retained in history. Settings/tombstones need one authoritative choice. Full resolved pairs also have a local internal archive; it has no separate recovery UI and is excluded from standard library exports.

Meaningful saved edits retain prior snapshots, capped at 20 per prompt. Restoring history snapshots the current content first. Drafts are durable local records, separate from committed content and synchronization. Reopening offers recovery; explicit keep/discard decisions control unsaved closing.

Trash cleanup runs on repository initialization and hourly while the app is open. At 30 days, expired prompts become lightweight tombstones. Permanent deletion also replaces related retained history with tombstones, including cloud history after hydration. Earlier independent backups and local recovery metadata are not erased by that action. Soft deletion removes collection membership; restoring content does not reinsert those memberships automatically.

## Export, import and upgrade

Prompta JSON remains schema version 1. Export includes stored prompt/template text, organization, memberships/order, retained versions, settings and metadata. Connected exports synchronize and hydrate shared history first. Unresolved conflicts must be reviewed. Tokens, PINs, server secrets, drafts, outbox entries and internal conflict archives are excluded.

Import validates untrusted fields and total size before committing. Skip mode preserves existing IDs; copy mode remaps the entire imported graph. Ownership is assigned to the current shared workspace. Existing settings survive, and tombstones never act as imported delete commands. Limits are 25 MiB/50,000 records, 900 KiB per entity and 10,000 collection references.

The same-origin legacy local cache has an explicit **Review import** action after unlock. It reads only the old `local` partition, presents the normal preview and leaves the source intact. Other browser/origin/authenticated libraries use a prior-release JSON export. No private cache is silently merged into the shared workspace.

## UI and offline shell

All prompts is the default, including legacy `?page=home`. Home/marketing/sample-data controls are removed. Cards show full titles/content without clamping. Active card main/blank clicks copy original text immediately. There is no Details button: Variables appears only when placeholders exist and opens its form directly, while History in the ellipsis menu opens the panel on the history tab. Create/save/duplicate do not automatically open a panel. Nested actions do not also trigger copying. Mobile navigation is Prompts, Favorites, New and Collections.

The grid Size slider sets the minimum card width between 240 and 560 pixels in 10-pixel steps. The responsive grid still fits the available viewport. Its preference is stored on the device, separately from shared library settings.

VitePWA precaches the production app shell and bundled assets. API paths are excluded from navigation fallback and are not cached as authentication responses. Returning offline use requires an installed service worker and an eligible previously unlocked cache. Rendering is paged, but current prompt text remains in memory for local search; there is no server full-text search index or unlimited virtualization.

## Independent snapshots

The scheduled handler runs at 21:00 UTC, corresponding to 03:00 Asia/Dhaka. It clears expired session/rate-limit records and, when R2 is bound, reads all workspace records through one consistent D1 SELECT. It creates a new private JSON object containing schema version, timestamp and entities, with a SHA-256 checksum in metadata. Session/limit tables are excluded. The snapshot limit is 50,000 records/25 MiB; errors update server status instead of claiming success.

Snapshots older than 30 days are pruned only after a successful new write. Status distinguishes absent configuration, awaiting first snapshot, a successful timestamp, failure and success older than 36 hours. The API exposes status, not a public bucket listing/download endpoint. Administrative download and explicit import provide recovery. Same-account snapshots do not protect against deleting the entire account/bucket; independent downloaded exports remain useful.

## Scope and verification

The production path is implemented but was not deployed for this delivery. See [TEST_RESULTS.md](TEST_RESULTS.md) for executed frontend/repository and real local Worker/D1/R2 tests, plus browser checks and remaining live checks. A local runtime result does not establish live cross-device availability or scheduled backup reliability.

Android and browser-extension clients are deferred. Domain, repository, network and clipboard boundaries are separated so later clients can reuse logic while providing their own storage, session/cookie and platform integration.
