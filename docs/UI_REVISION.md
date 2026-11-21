# Prompta — current product revision

The user's later instructions supersede the corresponding requirements in [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md). That file remains the historical brief. This document records the current UI and the subsequent shared-PIN/cloud revision.

## Access and setup revision

| Area | Current requirement |
|---|---|
| Sign-in | Remove Google sign-in and Firebase from the active product. |
| Access | Use one user-chosen shared PIN, verified by the server, with a session cookie. No hardcoded/default PIN. |
| Shared data | One shared library accessible from the same deployed URL on any device after PIN unlock. All PIN holders have the same access. |
| Backend | Cloudflare Worker and D1, with optional separate R2 snapshots. |
| Setup | Modular `npm install` → `npm run setup` → `npm run launch`; setup stores private local configuration, launch explicitly publishes. |
| Local preview | Real local Worker/D1/PIN. Missing server APIs fail closed; static-only browser storage is not the default release. |
| Migration | Preserve prior data and require review/confirmation before importing a legacy local cache or JSON into the shared workspace. |
| Publication | Prepare the complete deployment path, but do not publish during this delivery. |

The production secrets are server-only. The setup scripts choose random salts/secrets and preserve a stable workspace ID for later updates. A new configuration is not automatically connected to an earlier database. Local preview data and the deployed library are separate.

## Interface revision

| Area | Current behavior |
|---|---|
| Initial screen | All prompts; legacy `?page=home` displays the same view. |
| Dashboard | Remove Home, welcome sections, slogans, promotional illustrations and decorative filler. |
| Initial data | Empty new library; no sample-data control or automatic examples. |
| Card click | Grid/list main content or blank area copies the exact original prompt immediately. |
| Card content | Show full titles and prompt content without truncation or line clamping. |
| Details | Remove the Details button entirely. |
| Variables | Show a direct Variables button only for active records with placeholders; open its form immediately. Ordinary copying preserves placeholders. |
| History | Put History in the ellipsis menu; open the panel directly on its history tab. |
| Grid size | Provide a Size slider from 240 to 560 pixels; persist the preference on the device. |
| Save/duplicate | Creating, saving and duplicating do not automatically open or switch a panel. |
| Desktop shell | Remove the sidebar workspace card and duplicate desktop topbar; keep navigation and functional page controls. |
| Mobile | Prompts / Favorites / New / Collections. |
| Language | Short task labels; retain user content, practical errors, destructive confirmations and real sync/backup status. |

Favorite/menu/Variables/restore/template-use controls must not also trigger card copying. Active templates follow raw-copy card behavior; Use template remains distinct. Deleted records stay read-only until restored. Copied feedback requires clipboard success, and usage is recorded through the repository. These latest card instructions replace the earlier separate-Details-button design.

Data retention, validated import/export, versions, drafts, offline outbox and conflict preservation continue to apply. PIN/session access does not claim to encrypt browser caches. Scheduled backups are not reported successful until a server snapshot exists.

[SETUP.md](SETUP.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [BACKUPS.md](BACKUPS.md) describe the current operating contract. [TEST_RESULTS.md](TEST_RESULTS.md) records the checks actually executed. Earlier Firebase/Google test evidence applies only to the superseded release.
