#!/usr/bin/env node
// Kept as a harmless compatibility command for people following the old guide.
// Cuebase is deployed by the existing Cloudflare Pages Git connection.
console.log(`Cuebase uses Cloudflare Pages.

1. Push this project to your connected GitHub repository.
2. In your existing cuebase Pages project, use npm run build and output directory dist.
3. Add the D1 binding DB and the encrypted Secret PIN, then redeploy.

See START_HERE.txt. This command does not publish or change any cloud resource.`);
