ChatFocus V1.21 — CFocus Open / NoMask Provider

Upgrade from V1.20:
1. Replace public/index.html, public/app.js, public/styles.css and src/worker.js.
2. Add migrations/0008_nomask_provider.sql.
3. Replace wrangler.toml, package.json and .dev.vars.example.
4. In Cloudflare Worker Settings > Variables and Secrets, add a SECRET named NOMASK_API_KEY. Do not put the key in GitHub.
5. Deploy with:
   npm run db:remote && npx wrangler deploy
6. Open Admin Control Center > Limits & Access > Product Defaults.
7. Enable CFocus Open (NoMask), choose the NoMask model and save.

Default confirmed NoMask connection:
- Base URL: https://nomask.ai/api/v1
- Endpoint: /chat/completions
- Authorization: Bearer NOMASK_API_KEY
- Default model: qwen_3.8_uncensored

V1.21 keeps CFocus 1.0 / GPT-6 Luna as the multimodal mode. CFocus Open is text-only until NoMask image/file request syntax is confirmed.
