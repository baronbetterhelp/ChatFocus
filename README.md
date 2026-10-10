# ChatFocus V1.19 — AI Usage & CallFocus-Style Cost Tracking

V1.19 adds a dedicated AI Usage dashboard to the Admin Control Center and tightens the low-cost GPT-6 Luna pipeline so ChatFocus usage can be monitored the same way as CallFocus.

## Admin → AI Usage

The new dashboard shows:

- Completed AI replies
- Images analyzed
- Total OpenAI requests
- Estimated API cost
- Input tokens
- Cached input tokens
- Output tokens
- Last updated time
- Recent request cards with customer, time, images, token usage, request type and estimated cost

## Cost formula

For normal GPT-6 Luna Standard requests up to 272K input tokens:

- Uncached input: $0.10 / 1M tokens
- Cached input: $0.01 / 1M tokens
- Output: $0.50 / 1M tokens
- Web search: $0.01 per recorded call

For GPT-6 Luna requests over 272K input tokens, V1.19 uses the current long-context Standard rates in the estimate.

This is the same token-cost formula used by the CallFocus AI Usage display shown during development.

## Low-cost behavior retained/improved

- GPT-6 Luna
- Standard processing
- Low image detail by default
- Images compressed client-side before upload
- Only images/files from the current user turn are sent to OpenAI
- Historical images are not resent on every follow-up
- Normal responses use low reasoning
- High reasoning is used only when the user explicitly enables Intelligence
- Chat title/memory metadata generation is reduced: immediate while the title is generic, then only every 8 completed messages
- Metadata uses `reasoning: none` with a small output cap
- Internal metadata requests are tracked in AI Usage but do not consume the customer's daily visible AI-request allowance

## Upgrade from V1.18

Replace/add:

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `src/worker.js`
- `migrations/0007_ai_usage_costs.sql`

Deploy with:

```bash
npm run db:remote && npx wrangler deploy
```

No API key, D1 binding, R2 binding, or Wrangler configuration change is required.
