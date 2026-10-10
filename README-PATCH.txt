ChatFocus V1.6 — Smart Workspace patch for V1.5

Replace/add these files in GitHub:
- public/index.html
- public/styles.css
- public/app.js
- src/worker.js
- migrations/0002_workspace.sql
- wrangler.toml

Keep your Cloudflare OPENAI_API_KEY secret unchanged.
Your deploy command remains:
  npm run db:remote && npx wrangler deploy

The deployment will automatically apply migration 0002 before publishing the Worker.
