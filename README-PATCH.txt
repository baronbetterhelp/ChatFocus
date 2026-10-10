ChatFocus V1.17 — Low-Cost Vision Pipeline

Upgrade from V1.16 by replacing/adding:
- public/index.html
- public/app.js
- src/worker.js
- migrations/0006_low_cost_vision.sql

Deploy command:
npm run db:remote && npx wrangler deploy

Main savings:
- 1600px max-edge sequential image optimization before upload
- 4-image mobile / 6-image desktop upload batching
- low image detail by default
- only current-turn attachments sent to OpenAI, preventing repeat billing of old screenshots
- normal reasoning uses low; Intelligence remains high
