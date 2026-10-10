ChatFocus V1.11 Patch — Clean Action Menu & Response Time

For an existing V1.10 site, replace/add:
- public/app.js
- public/styles.css
- src/worker.js
- migrations/0003_response_time.sql

Then deploy normally with:
npm run db:remote && npx wrangler deploy

The new migration adds response_time_ms to messages so response time persists after refresh.
