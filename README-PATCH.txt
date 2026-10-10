ChatFocus V1.18 Patch — Visible Image Upload Limits

Replace:
- public/index.html
- public/app.js
- src/worker.js

No migration is required.

After deployment, Admin Console > Limits & Access will show:
- Image uploads on/off
- Default daily image uploads (0 = unlimited)
- Maximum image size (MB)

This version also prevents stale cached HTML from hiding new admin controls after future updates.
