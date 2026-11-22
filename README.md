<<<<<<< HEAD
# Cuebase 0.8
=======
# Prompta 0.7 .
>>>>>>> d6e2d5f399d3ff93593a6695f8e1d7a86d065975

Cuebase is the renamed Prompta prompt library. It now uses **GitHub → Cloudflare Pages**, with a shared PIN set in the Cloudflare dashboard. Keep your existing Pages project and **https://cuebase.pages.dev/**.

## Put this version online

Read **[START_HERE.txt](START_HERE.txt)** for the short Windows instructions or **[Setup](docs/SETUP.md)** for screenshots-free, step-by-step dashboard guidance.

| Setting | Value |
|---|---|
| Existing Pages project | `cuebase` |
| Existing GitHub repository | `shayerfolio/Prompta` can keep its name |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Blank / repository root |
| D1 binding name | `DB` |
| D1 database | Existing `prompta-library` |
| Cloudflare Secret | `PIN`, containing 6–12 digits |

The first API request prepares the database automatically. When the database contains one existing Prompta workspace, Cuebase retains it and its records. A fresh database gets an empty library. Database or PIN setup problems show a useful error instead of opening an unprotected local library.

**This package has not been deployed to your account.** Your existing Worker and database are unchanged by downloading or building it. The Windows updater changes local project files only; GitHub Desktop's Push is what triggers the connected Pages build.

## What stays

- All prompts is the first page.
- Click a grid card or list item to copy its original text immediately.
- A separate Variables button opens the variable form when a prompt has placeholders.
- Full prompt text, no Details button, and a grid Size slider remembered on this device.
- Create, edit, duplicate, favorite, search, categories, tags, collections and templates.
- Version history, drafts, trash, reviewed JSON import/export, offline outbox and conflict resolution.
- One shared library for everyone with the PIN, including other devices. No Google sign-in.

The PIN is checked on the server. It is not inserted into the browser's JavaScript. Changing the Cloudflare PIN secret and redeploying invalidates older online sessions. Previously downloaded offline data is still on that device; the browser cache is not encrypted.

## Updates and changing the PIN

For future code updates, commit and push the project through GitHub Desktop. Pages builds it automatically. For a PIN change, edit the `PIN` secret in the **cuebase Pages project**, save, and deploy again. See [Deployment](docs/DEPLOYMENT.md).

The default Pages version does not run a scheduled backup job. JSON export remains available. Separate scheduled R2 snapshots are an optional advanced addition; see [Backups](docs/BACKUPS.md).

## Optional local preview

You do not need local preview to host the site. If you want it, install Node.js 22.12 or newer, then run these commands in the project folder:

```bash
npm install
npm run setup
npm start
```

Setup asks only for a local PIN. This is separate from the Cloudflare PIN. Local preview uses a local database and never deploys or changes your live library. `Start-Cuebase.bat` and `Start-Cuebase.command` run that workflow. Local records need export/import to move online.

## Development

```bash
npm test
npm run build
npm run dev
```

The build checks TypeScript, creates the frontend, and bundles the Pages server into `dist/_worker.js`. `_routes.json` sends API requests to that server; Pages serves the static app. There is no root Wrangler deployment configuration to override the dashboard. `npm run launch` only prints Pages instructions; it does not deploy.

| Folder | Purpose |
|---|---|
| `src` | Interface, local repository, sync and shared models |
| `worker` | Pages adapter, PIN/session checks, D1 records and optional backup implementation |
| `migrations` | Reference database schema; Pages initializes it automatically |
| `scripts` | Build, optional local preview and Windows project update |
| `tests` | Interface, data protocol, authentication, migration and package checks |
| `docs` | Setup, operation, architecture and actual verification |

Legacy storage keys, cookie names, workspace IDs and the JSON format marker `app: "Prompta"` deliberately remain compatible. New visible branding and export filenames use Cuebase. Do not rename internal database values to rebrand the app.

The updater stores replaced code under ignored `.cuebase/update-backups/`. Private local settings, databases, dependencies and build output stay out of Git. See [Architecture](docs/ARCHITECTURE.md), [Feature checklist](docs/FEATURE_CHECKLIST.md) and [Test results](docs/TEST_RESULTS.md) for implementation details and limits.
