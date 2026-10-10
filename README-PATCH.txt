ChatFocus V1.14 — Admin Control Center Patch

Upgrade from V1.13 by replacing/adding:
- public/index.html
- public/app.js
- public/styles.css
- src/worker.js
- migrations/0004_admin_control.sql

Then deploy with:
npm run db:remote && npx wrangler deploy

New admin features:
- Overview analytics
- Customers panel
- Global daily AI request limit
- Per-customer daily overrides and Unlimited access
- Service on/off switch
- Signup/memory/web controls
- Open response mode
- Toggleable owner service rules
- Editable master instructions

Open response mode can make ChatFocus more direct at the product layer, but it does not disable the underlying OpenAI/API safety requirements.
