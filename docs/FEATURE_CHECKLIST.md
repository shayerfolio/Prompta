# Prompta 0.7 feature checklist

This checklist follows the user's later [product revision](UI_REVISION.md): shared PIN access, one shared library, Cloudflare Worker/D1, concise UI and immediate original-copy card behavior. Those requirements supersede the corresponding single-owner/Google/Firebase, Home-dashboard and promotional-content requirements in the historical [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md).

**Implemented** means included in the source. **Requires deployment/live check** means the code exists but no production service was configured or verified during delivery. Actual executed tests are recorded in [TEST_RESULTS.md](TEST_RESULTS.md); historical Firebase test logs are not evidence for this release.

## Library and interface

| Feature | Status and exact behavior |
|---|---|
| Initial route/data | All prompts, including legacy `?page=home`; empty new workspace; no Home or sample-data UI |
| Application shell | Desktop sidebar and concise page controls; no workspace marketing card or duplicate topbar; mobile Prompts/Favorites/New/Collections |
| Browsing | Grid/list with persisted view, search, combined filters and bounded results; full title/content without clamping; grid Size slider from 240 to 560 pixels, saved on this device |
| Original copy | Card main/blank clicks copy exact stored text immediately; nested favorite/menu/Variables/template-use actions stay separate |
| History access | History in the ellipsis menu opens the panel on its history tab; no Details button and no automatic panel on create/save/duplicate |
| Variables | Direct Variables button only for active records containing placeholders; unique fields, repeated literal replacement, live preview and explicit incomplete-copy confirmation |
| Editor | Required title/content, type, category/tag creation and selection, multiple collections, favorites, references and variable detection |
| Drafts | Durable local autosave, recovery choice, unsaved keep/discard handling and no stale draft recreation after save |
| Categories/tags | Create, rename, appearance, filtering and reference cleanup; category deletion can reassign |
| Collections | Create/edit/delete, descriptions, membership and order; removing a collection keeps its records |
| Search/filters | Case-insensitive partial search over prompt and organization fields; category/tag/collection/type/favorite filters combine; one tag filter at a time |
| Sorting | Modified/created/title/recent-use/copy-count orders plus explicit collection order |
| Favorites/use | Dedicated favorites/recent views and copy count/timestamps; usage metadata is shared, not a per-person audit log |
| Templates | Separate reusable records; copying original and applying to a new prompt remain distinct actions |
| Version history | Latest 20 meaningful revisions, lazy fetching, comparison and restoration that preserves current content |
| Recycle bin | Read-only deleted cards/history, restore, confirmed permanent delete/empty, 30-day expiry and tombstones |
| Settings | Access/lock, appearance, library preferences, data/backups, local storage estimate, synchronization and conflict review |
| Accessibility | Labeled semantic controls, keyboard actions, focus/dialog handling and reduced motion; no formal WCAG certification claim |
| Text/links | Prompt text is not executed; variable values are literal; references reject unsafe schemes/credentials |

## Shared access and synchronization

| Feature | Status and exact behavior |
|---|---|
| Google/Firebase | Superseded and removed from active dependencies/backend/setup; no Google sign-in in this release |
| Shared PIN | Implemented server verification; 6–12 digits, leading zeros preserved, salted PBKDF2 hash; no shipped/default PIN |
| Session | Random token in HttpOnly/Secure/SameSite cookie, server token hash, default seven-day expiry and explicit revocation |
| Unlock limits | Persistent per-IP/shared-workspace attempt windows; server-enforced origin and HTTPS requirements |
| Shared library | One stable server workspace ID and D1 library per deployment; everyone with the PIN has equal access |
| Fail-closed startup | Default app requires the PIN API; no automatic browser-only fallback for missing/invalid configuration |
| Lock | Closes visible data, propagates to tabs and revokes server access; offline revocation completes on reconnect |
| Local persistence | Workspace-partitioned IndexedDB entities, durable drafts/outbox/conflicts |
| Offline use | Cached records remain usable within a previously unlocked session's remembered expiry; new/locked devices need a connection |
| Sync protocol | Atomic local outbox, stable sealed mutations, D1 revision comparisons/payload-hash receipts and bounded incremental pulls |
| Refresh | Polling while visible plus focus/reconnect refresh; not a pushed realtime feed |
| Conflict protection | Preserve local/cloud alternatives; explicit resolution and Save both where meaningful; tombstones prevent stale resurrection |
| Sync status | Pending/offline/syncing/error/conflict states; Synced only after successful work completes |
| Cross-device availability | Requires deployment and live verification; no production URL was created here |

## Setup, migration and recovery

| Feature | Status and exact behavior |
|---|---|
| Modular commands | `npm install`, `npm run setup`, `npm run launch` |
| Setup | Local-only masked PIN input, random hash salt/session secret/workspace ID, ignored generated files |
| Launch | Explicit Cloudflare login/provisioning, collision guards, D1 migrations, optional R2, secrets via stdin and deployment |
| Local review | Real local Worker/D1/PIN through `npm start` or `npm run dev`; separate data from production |
| Existing local cache | Settings → Data & backups → Review import, only after unlock/review/confirmation; source remains intact |
| Existing JSON | Versioned schema, field/size validation, preview, skip duplicates or copies with graph ID remapping |
| Export | Connected sync/history hydration and conflict review before JSON; no auth/secrets/drafts/outbox/internal archives |
| Independent backup | Optional private R2 JSON snapshots, daily at 03:00 Dhaka, with 30-day retention after successful output; requires deployment |
| Backup truth | Real server timestamp/errors and stale-success check; awaiting first backup is distinct from success |
| Recovery | Administrative private download, checksum comparison and explicit app import; live recovery drill still needed |

## Material limits

- PIN access protects the server APIs. Browser caches are not PIN-encrypted, and remote revocation cannot erase an offline copy. Use trusted devices.
- Shared access has no individual identities, roles, record ownership or per-person usage audit. Sharing the PIN shares all library permissions.
- Trash expiry runs on app initialization/hourly while open. It is not a separate server purge. Restoring a record does not restore removed collection membership.
- History is limited to 20 meaningful versions. Offline devices only have versions already cached; complete shared export needs a connection.
- Import allows at most 25 MiB / 50,000 records; entities below 900 KiB; collections at most 10,000 references. Existing settings are retained, and tombstones do not execute imported deletes.
- Current records remain in memory for local search. Rendering/network pages are bounded, but unlimited-library virtualization/server full-text search is not included.
- R2 snapshots remain in the same Cloudflare account. Account/bucket deletion requires an independently downloaded copy for recovery. Whole-database rollback is not an app import feature.
- Dark appearance is the current design. Light theme, other languages, public sharing links, granular team permissions, Android APK and Chrome extension remain outside this release.
- A local build/runtime test does not prove production authentication, cross-device availability, scheduled execution or recovery in your account. No deployment was performed.

## Handoff material

Source and lockfile; Worker/D1 migration; local/launch scripts; tracked configuration template; original brief and revised requirements; setup, deployment, backup and architecture guides; domain/repository/client/Worker tests; actual verification report. Private generated setup files, local records and test PINs must not be distributed with the project.
