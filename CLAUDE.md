# Prompt Library: project context

## What this is

A browser-only prompt library built with **vanilla HTML, CSS, and JavaScript**. Prompts are stored in `localStorage` under the key `prompt-library-items`. There is no build step, no framework, and no backend.

Each feature was originally built by prompting an AI with a different prompt engineering technique (zero-shot, one-shot, few-shot, structured output, chain of thought). That story is told in `README.md`.

## Files

- `index.html`: layout (prompt form, library panel, export/import buttons)
- `style.css`: mint/teal theme (DM Sans + Space Grotesk), cards, stars, confidence badges
- `script.js`: storage, rendering, rating, notes, metadata (`trackModel`, `updateTimestamps`, `estimateTokens`), JSON export/import with rollback

## Rules

- Keep it vanilla JS. Do not add libraries, frameworks, npm packages, or a build step.
- Do not remove or redesign existing features. Make focused fixes only.
- Keep the existing visual style. Reuse existing CSS variables and classes.
- Any user-controlled or imported value that goes into HTML (text **or** attributes) must be escaped.
- Keep the existing data shape so old `localStorage` data and old export files still load.
- After each change, explain what changed and how to test it in the browser.
- Make one git commit per fix with a clear message.
