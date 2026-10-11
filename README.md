# ChatFocus V1.22 — Groq + NoMask CFocus Open

This release adds Groq as a first-class CFocus Open text provider while preserving NoMask as an optional fallback/provider choice. CFocus 1.0 remains the primary GPT-6 Luna multimodal mode for images, files, PDFs, web search and Intelligence.

## What changed

- Added Groq OpenAI-compatible chat-completions support.
- Default Groq model: `openai/gpt-oss-20b`.
- Default Groq base URL: `https://api.groq.com/openai/v1`.
- Admin can enable/disable CFocus Open, choose **Groq** or **NoMask**, and set the provider model.
- CFocus Open remains text-only. Uploading an image/file switches the chat to CFocus 1.0.
- AI Usage now separates OpenAI, Groq and NoMask requests.
- Provider API keys remain server-side Cloudflare secrets.

## Cloudflare secrets

Add these under Worker → Settings → Runtime variables and secrets:

```text
OPENAI_API_KEY
GROQ_API_KEY
```

`NOMASK_API_KEY` is optional if you still want NoMask available.

Do not put secret API keys in `wrangler.toml` or frontend files.

## Deploy

The existing deploy command can stay:

```text
npm run db:remote && npx wrangler deploy
```

Migration `0009_groq_provider.sql` adds the Groq provider defaults.

After deployment, open **Admin Console → Limits & Access → Product Defaults**. Turn on **CFocus Open**, select **Groq**, confirm the Groq API status shows configured, and save.
