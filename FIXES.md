# Fixes to make

Work through these **one at a time, in order**. For each fix:

1. Explain the problem and your plan.
2. Make the change.
3. Tell me how to test it in the browser.
4. Wait for my OK, then commit (one commit per fix).

Line numbers are approximate. Search for the function names.

---

## Fix 1: Security: escape and validate imported data (XSS)

**Problem:** In `renderPrompts()`, `renderRatingStars()`, `renderNotes()`, and `renderNote()`, these values go into HTML **without escaping**:

- `prompt.id` (in `data-card-id`, `data-delete-id`, `data-rating-id`, `data-note-form`, element `id`s like `notes-title-${prompt.id}`)
- `note.id` (in `data-note-id`)
- `prompt.metadata.tokenEstimate.confidence` (in the class `confidence-${...}` and in visible text)
- `prompt.rating` (in `aria-label`)

`validatePrompt()` only checks that `id` is a non-empty string, and it never checks `tokenEstimate` or the contents of each note. A crafted JSON file imported with **Import** could inject HTML or script into the page.

**Fix:**

- In `validatePrompt()`:
  - Require `id` to match a safe pattern, e.g. `/^[A-Za-z0-9._-]{1,100}$/`. Existing IDs from `crypto.randomUUID()` and the fallback `${Date.now()}-${Math.random()}` must still pass, so check that the fallback format matches the pattern.
  - Validate `metadata.tokenEstimate`: `min` and `max` are finite numbers, and `confidence` is exactly `"high"`, `"medium"`, or `"low"`.
  - Validate each note: `id` matches the same safe pattern, and `content` is a non-empty string.
  - Require `rating` to be an integer from 0 to 5.
- Also escape these values at render time (defense in depth). `escapeHtml()` currently assumes a string, so convert values with `String(...)` first.

**Test:** Export a file, edit one prompt's `id` in the JSON to `"x\"><img src=x onerror=alert(1)>"`, and import it. The import must be rejected and rolled back, and no alert should appear. A normal export → import round trip must still work.

---

## Fix 2: Confirm before deleting a prompt

**Problem:** The prompt delete button (the `[data-delete-id]` branch of the `promptList` click handler) deletes immediately. Note deletion and **Clear all** both ask first.

**Fix:** Add `window.confirm('Delete "<title>"?')` before deleting, matching the note delete behavior.

**Test:** Click Delete on a card. Cancel keeps the prompt. OK removes it.

---

## Fix 3: Stars render twice per card

**Problem:** `renderRatingStars(prompt)` is called twice in `renderPrompts()`: once in `.prompt-card-rating` (summary) and once in `.rating-row` (details). Each card has 10 rating buttons, and screen readers announce both sets.

**Fix:** Keep **one** interactive star group. Recommended: keep the details one interactive, and make the summary a read-only display (a `<span>` like `★★★☆☆` with `aria-label="Rated 3 out of 5"`, no buttons). Check `style.css` so the summary still looks the same.

**Test:** Rating still works from the expanded card. The collapsed card shows the current rating. Inspect the DOM: one set of rating buttons per card.

---

## Fix 4: Do not save temporary UI state

**Problem:** `prompt.editingNoteId` (set while editing a note) is stored on the prompt object itself. If the user rates a prompt or clicks Export while editing a note, `editingNoteId` gets written to `localStorage` and into export files.

**Fix:** Move editing state out of the data. For example, use a module-level `const editingNotes = new Map()` keyed by prompt ID. Update `renderNotes()` and the edit/cancel/submit handlers to use it. When loading prompts, drop any old `editingNoteId` left over from earlier saves.

**Test:** Start editing a note, rate the prompt, then check `localStorage` (DevTools → Application) and an export file. Neither should contain `editingNoteId`. Editing a note still works.

---

## Fix 5: Remove dead backup code

**Problem:** In `importPrompts()`, `IMPORT_BACKUP_KEY` is written to `localStorage` and removed in `finally`, but it is never read. The rollback actually uses the in-memory `previousStorage` and `previousPrompts`.

**Fix:** Remove `IMPORT_BACKUP_KEY` and the two lines that use it. Do not change the rollback behavior.

**Test:** An import with a broken file (e.g. delete a prompt's `title`) still shows "Import failed and was rolled back" and leaves the library unchanged.

---

## Fix 6: Repo housekeeping

- Add a `.gitignore` containing `.vscode/` and `.DS_Store`.
- Keep `README.md` as is. Only update the **Data Model** section if fixes 1–4 changed the data shape.
- Create `PROMPTS.md`: one section per feature (save/delete, rating, notes, metadata, export/import), each with the technique name and the prompt used. **Ask me for the prompts.** Do not invent them.

---

## Done when

- All five code fixes work, and the existing features (save, delete, expand, rate, notes, export, import merge/replace, clear all) still work.
- There is one commit per fix.
