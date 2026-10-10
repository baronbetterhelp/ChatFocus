# ChatFocus V1.8 — Web Search & Version Awareness

V1.8 makes the previously ambiguous composer control a real **Web Search** toggle and gives CFocus exact awareness of the current ChatFocus release.

## Changes
- The old target-like composer glyph is replaced by a clear Web button with a search icon.
- Web Search is persisted per browser and shows an obvious active state.
- When Web Search is ON, the backend adds OpenAI Responses API `web_search` and requires the tool to run for that request.
- CFocus now knows the current application release is **ChatFocus V1.8** and the public model identity is **CFocus 1.0**.
- Questions such as “what version am I using?” are answered from real runtime state instead of saying the build is unavailable.
- Intelligence state awareness from V1.7 is preserved.

No database migration is required.
