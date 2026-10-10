# ChatFocus V1.5 — Composer Controls

V1.5 refines the mobile composer controls while preserving the V1.4 backend and settings experience.

## Changes

- Replaces the placeholder dictation glyph with a real microphone icon.
- The microphone button is now a true toggle: tap to start browser dictation, tap again to stop when supported.
- Listening state is visually highlighted and accessible through `aria-pressed` / updated labels.
- If browser speech recognition is unavailable, ChatFocus gives a clear fallback message instead of appearing broken.
- When Intelligence is enabled from the `+` menu, an active Intelligence button appears immediately beside the microphone.
- Tapping the active Intelligence button turns Intelligence back off.
- On very small phones the Intelligence pill collapses to its icon so the composer remains responsive.

No D1, R2, migration, API-key, or Cloudflare binding changes are required.
