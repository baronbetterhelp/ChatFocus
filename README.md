# ChatFocus V1.23 — Separate Groq and NoMask Modes

This release separates the alternate text providers completely. Groq and NoMask are no longer grouped under one CFocus Open switch.

## What changed

- **CFocus Groq** is now its own text mode.
- **CFocus NoMask** is now its own text mode.
- Each provider has its own independent **ON/OFF switch** in Admin Console → Limits & Access → Product Defaults.
- Each provider has its own public mode name, model setting and API configuration status.
- NoMask is disabled by default in this migration so it will not be used before you decide to fund/enable it.
- Existing V1.22 chats stored as the old shared `open` mode are migrated to `groq` so they continue working through Groq.
- Images/files still switch the current conversation back to **CFocus 1.0**, because the Groq/NoMask modes in this release are text-only.
- Usage tracking remains separated by provider (`openai`, `groq`, `nomask`).

## Required Cloudflare secrets

For CFocus Groq:

```text
GROQ_API_KEY
```

For CFocus NoMask, only when you decide to use it:

```text
NOMASK_API_KEY
```

## Deployment

The existing deployment command still works:

```bash
npm run db:remote && npx wrangler deploy
```

Migration `0010_separate_text_modes.sql` creates the independent provider switches and converts the old shared `open` chat mode to `groq`.

After deployment, open **Admin Console → Limits & Access → Product Defaults**. You will see separate switches for **CFocus Groq** and **CFocus NoMask**. Leave NoMask off until you want to use it.
