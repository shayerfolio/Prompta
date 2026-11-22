# Cuebase deployment and updates

## One supported default

Use the existing Git-connected Cloudflare Pages project. Build with `npm run build`, output `dist`, root repository directory. Configure `DB` and Secret `PIN` in the dashboard. [Setup](SETUP.md) gives the complete one-time steps.

`dist/_worker.js` is a Pages advanced-mode Function. It verifies PINs and handles `/api` and `/api/*`; the static frontend is served by Pages. A single Pages address therefore provides the interface and the API. No separate Worker URL or frontend API URL is required.

There is deliberately no root Wrangler deployment file. Dashboard bindings and secrets remain editable in Cloudflare. The generated local development configuration, if any, belongs under ignored local state only. `npm run launch` prints guidance and has no deploy operation.

## Everyday code updates

1. Edit or replace the local project files.
2. Review, commit and push through GitHub Desktop to the connected production branch.
3. Wait for the Pages build to succeed.
4. Open the same site address. If the old version remains, close all its tabs and reopen it; keep browser data intact.

Do not rerun old Prompta Worker launch scripts. Retrying a deployment rebuilds that deployment's commit; select the new commit when retrying.

## Changing the PIN

Open **Workers & Pages → cuebase → Settings → Variables and Secrets**. Edit Secret **PIN**, save, and deploy again. Use 6–12 digits. Other online sessions must unlock again. Devices that are already offline retain their downloaded cache until they reconnect or their remembered session expires.

Keep `DB` bound to the same D1 database. Recreating or switching databases creates a different library. No data migration is needed for a name or PIN change.

## Rollback

Keep the last downloaded ZIP and an independent JSON export. A Pages code rollback does not undo D1 changes or revert records. The 0.8 initialization adds only compatible tables and indexes, so it does not delete 0.7 records. A rollback to older PIN code can reactivate older access behavior; retire obsolete deployments as part of a deliberate operational rollback.

Production and Preview are distinct environments. Give previews their own database and PIN if enabled. Avoid testing edits against the live database.

## Hosting requirements

Node.js 22.12 or newer for the build. Cloudflare Pages Functions with one D1 binding. No Firebase, Google OAuth, API key in the frontend, R2 subscription or manual schema command is required by this default setup. Cloudflare usage limits still apply to your account.

[Cloudflare Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/) · [Bindings and secrets](https://developers.cloudflare.com/pages/functions/bindings/) · [Advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)
