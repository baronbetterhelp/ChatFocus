ChatFocus V1.20 Patch — Session Resume & Clean Launch

For an existing ChatFocus V1.19 installation, replace only:
- public/index.html
- public/app.js
- public/styles.css
- src/worker.js

No database migration is required.
No wrangler.toml change is required.

What this fixes:
- Reopen the exact last conversation for the current account.
- If there is no remembered chat, open a fresh New chat instead of a pinned/random conversation.
- Stop the login screen from flashing before the already-authenticated app loads.
- Use a neutral ChatFocus launch gate while validating the existing session.
