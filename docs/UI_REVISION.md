# Current Cuebase requirements

The latest user request renames Prompta to **Cuebase** and replaces its deployment workflow with the user's familiar **GitHub → Cloudflare Pages → PIN in the dashboard** system.

| Area | Current behavior |
|---|---|
| Hosting | Existing cuebase Pages project and cuebase.pages.dev address |
| Setup | Dashboard Secret PIN and D1 binding DB; automatic schema preparation |
| Existing data | Retain the existing database and stable workspace |
| Access | Shared server-checked PIN; no Google sign-in or individual accounts |
| First page | All prompts |
| Cards and lists | Full title/content; click copies original prompt immediately |
| Variables | Separate button when placeholders exist |
| Details | No Details button |
| History | Ellipsis menu opens the history panel |
| Grid size | Device-local Size slider, 240–560 pixels |
| Content | Short functional labels, practical errors and actual state |
| Save and duplicate | Do not open an unrelated panel |
| Shared features | CRUD, organization, history, drafts, trash, import/export, offline outbox and conflicts retained |
| Branding | Cuebase in visible UI, title, icon and download filenames |
| Compatibility | Existing storage/protocol/JSON identifiers retained |
| Backups | JSON export included; no implicit Pages schedule |

Everyone with the PIN has the same library permissions. New workspaces start empty. This package is prepared and tested locally; publishing to the user's Cloudflare account is a separate action.
