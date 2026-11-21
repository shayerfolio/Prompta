# Prompta 0.7 verification

Verified on 21 November 2026. This report covers the shared-PIN release, grid-size slider and removal of per-card Details controls. The original brief remains historical; current behavior is recorded in UI_REVISION.md.

## Automated checks

`npm test` completed successfully: **107 tests passed across 8 files; none skipped**. The executed output is in [automated-test-results.txt](automated-test-results.txt).

| Suite | Passed | Evidence covered |
|---|---:|---|
| Domain | 9 | Variable syntax/literal replacement, validation, search and ordering |
| Repository | 23 | Durable prompts/drafts, organization, history, trash, import/export, outbox/conflicts and preserved legacy local-cache import |
| PIN/session client | 21 | Fail-closed startup, shared workspace selection, wrong PINs, stale-response races, lock propagation, expiry, offline cache, cursor and mutation retention |
| Conflict protocol | 8 | Revision comparison, idempotent acknowledgment, tombstones and useful error states |
| Prompt experience | 11 | Editing, recovery, variables, history and queued draft ownership after locking |
| Prompt cards | 12 | Immediate original copy, control/menu isolation, direct Variables, History access and inert deleted cards |
| Grid size | 6 | Grid-only slider, range, persistence and unavailable/invalid device storage |
| Worker integration | 17 | Actual local workerd, D1 and R2 behavior |
| **Total** | **107** | **8 passing files** |

The Worker tests execute the real runtime and storage bindings through Miniflare. They verify PIN hashing and leading zeros; secure cookie attributes; expiration/revocation and PIN-rotation epochs; exact-origin checks; concurrent per-IP/global throttles; missing configuration; loopback-only HTTP; two independently unlocked sessions sharing records; entity validation; competing same-revision writes; retry receipts; reused mutation-ID rejection; deletion conflicts; current/history/export pagination; and an independent scheduled R2 snapshot with checksum. A large-data regression verifies the SQL backup guard rejects a library above 25 MiB before loading its content, retaining the last valid snapshot and timestamp.

## Build and launch preparation

`npm run build` passed frontend TypeScript, Worker TypeScript and the Vite/PWA production build. Its output is in [production-build-results.txt](production-build-results.txt). The final build requires the same-origin PIN API; it is not the temporary local-only layout build.

All four Node setup/launch/server scripts passed syntax checks. Setup, launch and server help paths ran without remote mutations. The macOS launcher passed shell syntax checking. Documentation links resolve, package and lockfile versions agree at 0.7.0, and Firebase dependencies have been removed.

An isolated local setup used generated salt/session/workspace values, real D1 migrations and the standard local Worker wrapper. No QA PIN, installation secrets or local records are included in the deliverable. The wrapper uses supported explicit network/inspector settings and ran through the managed preview successfully.

## Browser review

The production PIN entry screen was visually inspected and left at its PIN/Unlock state. PIN authentication, protected data requests and session races were tested through the client and real Worker suites; entering a credential in the browser was not part of this review.

The library layout was reviewed in an isolated browser-local QA build using existing test prompts. The grid slider changed the desktop layout from three columns to one at its maximum, accepted its minimum setting, and retained its setting across refresh. It is absent from list view. There are no Details buttons; complete prompt text remains visible. Card activation kept the URL unchanged and opened no dialog. Variables opened its form directly, and History in the menu opened the history tab.

Responsive layout was inspected at 320, 390 and 768 pixel frame widths. At 320, both grid and list fit the 313-pixel content viewport without horizontal document overflow; at 768, scroll width and client width were both 761 pixels. Small-screen grid controls use two balanced rows. The QA fixture was removed and the normal production headers/build were restored afterward.

The browser clipboard adapter returned an empty value during attempted readback. Exact clipboard contents are therefore covered by automated copy/literal-content tests rather than claimed as a completed browser paste test. No deliverable screenshots were saved.

## Checks requiring a deployed installation

No Cloudflare resources were created or deployed for the user. Production HTTPS cookie delivery, cross-device operation on the deployed URL, real daily scheduled execution, retention aging, and a real restore drill have not been observed in the user's account. The scheduled handler and independent snapshot were verified locally. Physical mobile devices and a cold offline start in each target browser were not tested.

A previously authorized offline cache is not an encrypted vault. Sharing the PIN grants equal library access. These are documented product behaviors, not a claim of individual account isolation or instant remote erasure.
