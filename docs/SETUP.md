# Set up Cuebase on your existing Pages project

This guide keeps **https://cuebase.pages.dev/** and your **prompta-library** database. The code is prepared for Cloudflare Pages; you do not need a separate Worker deployment.

## 1. Update the files on your PC

If you have unsynced work in the old app, let it sync before moving over. If you already have saved prompts, keep a JSON export from **Settings → Data & backups → Export library** as a separate copy.

1. Download and extract the full Cuebase ZIP in **Downloads**. Extract it outside the existing GitHub project folder.
2. Open the extracted `Cuebase` folder.
3. Double-click **Update-Cuebase.bat**. Node.js is already installed if you used the previous setup commands.
4. Enter your existing repository folder: `C:\Users\MSI\Documents\GitHub\Prompta`. If it is shown as the default, press Enter.
5. Wait for **Cuebase files are ready**.

The update preserves the `.git` repository, your GitHub connection and private local settings. It backs up the source it replaces in `.cuebase/update-backups/`, replaces the app folders, and removes old root Wrangler configuration and the faulty redirect. It also stops tracking local private settings and build files if an earlier upload included them. It does not remove secrets from historical Git commits; set a new PIN if an old one was uploaded.

If the project is somewhere else, **GitHub Desktop → Repository → Show in Explorer** shows the folder to use. The updater refuses unrelated projects and refuses to overwrite its own download folder.

### Manual update, if preferred

Keep the repository's `.git` folder and private local files. Back up the old code. Replace the source folders and root project files with this package. Remove old root `wrangler.json`, `wrangler.jsonc`, `wrangler.toml`, `wrangler.config.json`, `Start-Prompta.*`, and the old `public/_redirects`. Do not upload `.dev.vars`, `.prompta`, `.cuebase`, `.wrangler` or `node_modules`. The Windows button handles these details for you.

## 2. Push the updated project with GitHub Desktop

1. Open GitHub Desktop and select the **Prompta** repository.
2. Review the changed files. Full folders such as `src`, `worker`, `scripts`, `public` and `migrations` must be included.
3. Use a commit summary such as **Switch to Cuebase Pages**.
4. Click **Commit to [your current branch]** and then **Push origin**. Use the branch already connected to the Pages production deployment.

The repository can stay named `Prompta`. The app is named Cuebase. Renaming the GitHub repository is not needed for this update.

## 3. Check the Pages build settings

Open [Cloudflare](https://dash.cloudflare.com/) → **Workers & Pages** → your existing **cuebase** Pages project. In **Settings → Build → Build configuration**, use:

| Field | Enter |
|---|---|
| Framework preset, if requested | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Blank / repository root |
| Production branch | The branch you just pushed |

The Cloudflare build needs Node.js **22.12 or newer**. Your previous log already showed Node 22.23.4. Only if your build uses an older version, add the build variable `NODE_VERSION` with value `22`.

Keep the existing Pages project to keep its `cuebase.pages.dev` address. The package does not add a redirect to `workers.dev`.

## 4. Connect the existing database

Select the **Production** environment. Open **Settings → Bindings → Add → D1 database**.

| Field | Enter/select |
|---|---|
| Variable name | `DB` — uppercase |
| D1 database | Existing `prompta-library` |

Save. Select the database already used by the working Prompta Worker. Creating another database would create a separate empty library.

Cuebase prepares the required tables on the first API request. It keeps the existing workspace when the database has exactly one. It does not erase or rewrite prompts during setup. No SQL command or database ID needs to be copied.

For a completely new installation only: create a D1 database in Cloudflare, then bind it as `DB`. This is not needed for your existing library.

## 5. Set the PIN

In the same **cuebase Pages project**, open **Settings → Variables and Secrets → Add**.

| Field | Enter/select |
|---|---|
| Name | `PIN` — uppercase |
| Value | Your chosen 6–12 digit PIN |
| Type | Secret, or select **Encrypt** |

Save. Leading zeros work. Enter the PIN only in Cloudflare, not in GitHub source files or a `VITE_` variable. There is no default PIN. The session secret is generated and stored privately by the server, so there is no second secret to invent or copy.

If Production and Preview are separate tabs, configure Production first. Preview deployments need their own PIN and database binding if you want to test them; use a separate test database for previews.

## 6. Deploy the new code with the saved settings

Return to **Deployments**. After saving the binding and secret, retry the deployment for the new **Switch to Cuebase Pages** commit. You can also push a new commit to trigger the build.

Check the commit before retrying. An old deployment still builds its old files, even after you have uploaded newer files elsewhere.

Wait for a successful build. Open **https://cuebase.pages.dev/**, unlock it, and verify the prompts. Open that same address on your phone, enter the PIN, and check that a small test edit appears on both devices. Existing sessions from the old Worker address do not transfer; enter the PIN on the Pages address.

If you previously worked only in a browser-local preview, those records are separate. Export them from that preview and review an import in Cuebase. The same-origin **Existing prompts on this device → Review import** action can also copy an older local library without deleting its original.

## 7. Retire the older app after Cuebase works

Keep the old Worker until you have confirmed your prompts and a cross-device edit in Cuebase. The older `prompta.central-shayer.workers.dev` app is independent and still uses its own old PIN settings.

After you have a working Cuebase deployment and an export, retire the old **Worker named `prompta`** in Cloudflare. Delete only that obsolete Worker application if you no longer need it. **Keep the `cuebase` Pages project and the `prompta-library` D1 database.** This also ends any schedule attached to the old Worker. If you deliberately use it for scheduled R2 backups, arrange a backup-only replacement before retiring it; the standard Pages setup does not run a schedule.

Simply disabling the `workers.dev` address is incomplete: Cloudflare documents that version and preview addresses can remain accessible. Removing the obsolete app closes those alternate entry points too.

## If something does not work

| What you see | Check |
|---|---|
| Old Prompta name or an old error | Check that the deployment uses the new commit, then close all tabs for this site and reopen it. Keep browser data intact. |
| PIN configuration message | `PIN` is a Production Secret on the Pages project; save and redeploy. |
| Database setup message | Binding is exactly `DB`, pointing at `prompta-library`; save and redeploy. |
| Empty library | Check that you selected the existing database. Stop before importing or deleting anything if the wrong database is bound. |
| Wrong PIN | Use the PIN saved on Pages, which can differ from the old Worker PIN. |
| Several workspaces detected | Copy the full non-secret `PROMPTA_WORKSPACE_ID` from the old Worker's settings into Pages as a text variable, then redeploy. Never guess it. |
| Build cannot find `worker/tsconfig.json` | The whole project was not pushed. Use GitHub Desktop and include all changed source folders. |
| Missing API or static HTML returned by an API | Build output must be `dist`, and `npm run build` must produce `dist/_worker.js`. |

Current Cloudflare references: [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [D1 bindings and secrets](https://developers.cloudflare.com/pages/functions/bindings/), [Pages advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/), [Worker URL retirement caveat](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).
