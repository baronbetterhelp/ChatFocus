# ChatFocus

Premium multimodal AI chat application for Cloudflare Workers, D1 and R2, powered by OpenAI GPT-6 Luna.

## Included
- Email/password accounts with secure PBKDF2 password hashing and HTTP-only sessions
- Responsive premium chat UI, desktop + mobile
- Saved conversations, search, rename, pin (max 5), delete
- Edit a user message and resend from that point
- Regenerate assistant responses
- Streaming responses
- Image analysis and screenshot-reply workflows
- PDF, DOCX, PPTX, XLSX, TXT, CSV and common code/text file inputs
- Persistent cross-chat memory summaries
- File storage in Cloudflare R2
- Admin dashboard with users, usage, app settings and suspension controls
- Dark/light/system theme
- Markdown rendering, code blocks, copy buttons
- Browser speech-to-text dictation where supported

## Deploy
1. Install dependencies: `npm install`
2. Create D1: `npx wrangler d1 create chatfocus-db`
3. Put the returned database ID into `wrangler.toml`.
4. Create R2: `npx wrangler r2 bucket create chatfocus-files`
5. Set your OpenAI key: `npx wrangler secret put OPENAI_API_KEY`
6. Optional: set `ADMIN_EMAIL` in `wrangler.toml`. If blank, the first account created becomes admin.
7. Apply migrations: `npm run db:remote`
8. Deploy: `npm run deploy`

For local development, copy `.dev.vars.example` to `.dev.vars`, add the API key, run `npm run db:local`, then `npm run dev`.

## Notes
- Default model is `gpt-6-luna` and can be changed with the `OPENAI_MODEL` variable.
- Uploaded files remain private in R2 and are retrieved by authenticated API routes only.
- Cross-chat memory uses compact summaries generated from conversations and can be disabled per user or globally.


## V1.1 — Responsive Conversation UI

Replaces the static upload-focused landing screen with a full-height conversational interface. The composer stays at the bottom, image/file upload remains inside the composer, the mobile chat drawer fills the screen, and account/settings now opens as a full-screen panel. Includes the Cloudflare PBKDF2 100,000-iteration compatibility fix.
