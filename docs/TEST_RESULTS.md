# Cuebase 0.8 verification

## Result

**134 tests passed in 11 test files. No skipped tests.** The production build passed, including frontend and server TypeScript checks, Vite output and the bundled Cloudflare Pages server. The server bundle was regenerated after shortening the missing-PIN error to expose the setup guide consistently.

| Suite | Tests | What it verifies |
|---|---:|---|
| Domain | 9 | Validation, variables, filtering and export/import format |
| Repository | 23 | Local writes, history, drafts, import, outbox and conflict behavior |
| Cloud authentication client | 21 | Lock/unlock state, stale responses, revocation and offline cache boundaries |
| Cloud protocol client | 8 | Cursor progress, mutations, history and export behavior |
| Prompt experience | 11 | Editor and library interactions |
| Prompt cards | 12 | Exact-copy action, variables, independent controls and no automatic panel |
| Grid sizing | 6 | Slider bounds, device-local persistence and view behavior |
| Existing server | 17 | Real workerd/D1 sessions, rate limits, revisions and independent R2 snapshots |
| Dashboard setup server | 21 | PIN-only configuration with DB, automatic initialization, existing data preservation, concurrency and PIN rotation |
| Compiled Pages runtime | 3 | Actual Pages emulator routing, assets, API JSON, PIN unlock, hidden server bundle and missing-PIN protection |
| Project updater | 3 | Code backup, repository/private-file preservation, stale configuration removal and wrong-target refusal |

## Commands and evidence

- `npm test`: all 134 tests passed. Output: [automated-test-results.txt](automated-test-results.txt).
- `npm run build`: passed. Output: [production-build-results.txt](production-build-results.txt).
- Production build guard: Cloudflare Pages plus `VITE_LOCAL_ONLY=true` correctly fails before building, including when the local QA override is supplied.
- New and modified Node scripts passed syntax checks.

The Pages runtime tests bundle the real server and run `wrangler pages dev` against a local D1 database. They use a small static HTML fixture to isolate routing. The production frontend is built separately and its PIN/setup screens were checked in the browser.

## Database migration coverage

Tests exercise a fresh database, multiple concurrent initializers, existing workspace/prompt/history/cursor preservation, independent sessions, leading-zero PINs, PIN and optional session-secret rotation, configuration failure before schema writes, ambiguous workspace selection, mismatched overrides, transient failure recovery, HTTPS/origin checks, concurrent rate limits and stale-authentication cleanup. They use local workerd and real D1 bindings, not mocked SQL results.

## Browser check

The production app was opened through the managed local Pages preview. The title, Cuebase wordmark, C favicon, PIN screen and missing-configuration error rendered correctly. The Setup guide opened and displayed the database/PIN/redeploy steps without the old command-line setup instructions.

No production PIN or account credentials were requested or entered in the browser. Full authenticated browser interaction was not repeated for this rebrand; copying, variables, grid sizing and editor behavior are covered by the passing regression suites. The earlier responsive interface checks are historical evidence, not new mobile screenshots for this release.

## Project updater check

The updater was exercised against isolated Git repositories. It backed up replaced code, preserved private file bytes and unrelated files, removed private files from Git tracking, removed stale Wrangler/redirect files, and refused the wrong product or its own download folder. These tests ran on Linux with Node and Git. The thin Windows .bat launcher was reviewed but was not executed on a Windows desktop.

## Not performed

This delivery did not modify GitHub, Cloudflare secrets, production bindings, production data or a live deployment. It did not enable a scheduled backup, perform a live recovery drill, or establish cross-device production sync in the user's account. Those depend on deploying the package with the saved `PIN` secret and existing `DB` binding; [SETUP.md](SETUP.md) provides the short verification steps.
