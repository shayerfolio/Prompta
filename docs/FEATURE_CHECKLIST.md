# Cuebase 0.8 feature checklist

## Included

| Area | Delivered behavior |
|---|---|
| Hosting | GitHub-connected Pages, same-origin API, dashboard configuration |
| PIN | Secret named PIN; server verification, leading zeros, rate limits and session revocation |
| Database | DB binding, additive initialization, existing single workspace retained, concurrent setup safe |
| UI | Cuebase branding, All prompts default, intentional copy |
| Copy | One click copies exact raw text; feedback follows clipboard success |
| Variables | Dedicated action; ordinary copying keeps placeholders |
| Grid/list | Full prompt text, responsive layouts, persisted grid Size slider |
| Organization | Favorites, recent, categories, tags, collections, templates, search and filters |
| Editing | Create/edit/duplicate, draft recovery, content validation |
| History | Twenty retained meaningful revisions, comparison and restoration |
| Trash | Restore, confirmed permanent deletion and Empty bin; thirty-day expiry while app runs |
| Sharing | One shared library for all PIN holders, across devices |
| Offline | Previously unlocked cache, durable outbox, retry and explicit conflict resolution |
| Data portability | Reviewed JSON import/export and old local-library import |
| Migration tool | Local source backup, complete folder update, stale deployment-file removal, private-file untracking |

## Explicit limits

- Shared PIN access has no individual identities, permissions or per-person audit trail.
- Browser caches are not encrypted. Remote PIN changes cannot erase already downloaded offline copies.
- Sync polls while visible and on focus/reconnection. It is not instantaneous.
- Export requires a connected synchronized session; unsynced drafts/outbox/conflict archives are not included.
- Import and snapshot limits are 25 MiB / 50,000 records; entity and collection limits remain enforced.
- Local search caches current records in memory. Unlimited virtualization and remote full-text search are not included.
- The Pages build does not run a scheduled backup job. Separate optional R2 backup code remains available.
- Light theme, additional languages, Android APK, Chrome extension and public sharing links are outside this revision.
- Local checks do not establish a live deployment, production secret configuration or a recovery drill in the user's account.

See [TEST_RESULTS.md](TEST_RESULTS.md) for actual verification and [SETUP.md](SETUP.md) for deployment.
