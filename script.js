const STORAGE_KEY = "prompt-library-items";
const IMPORT_BACKUP_KEY = "prompt-library-import-backup";
const EXPORT_VERSION = 1;
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const CONFIDENCE_LEVELS = ["high", "medium", "low"];

const form = document.querySelector("#prompt-form");
const titleInput = document.querySelector("#prompt-title");
const modelInput = document.querySelector("#prompt-model");
const contentInput = document.querySelector("#prompt-content");
const codeInput = document.querySelector("#prompt-is-code");
const promptList = document.querySelector("#prompt-list");
const promptCount = document.querySelector("#prompt-count");
const clearAllButton = document.querySelector("#clear-all");
const characterCount = document.querySelector("#character-count");
const exportButton = document.querySelector("#export-prompts");
const importButton = document.querySelector("#import-prompts");
const importFileInput = document.querySelector("#import-file");

let prompts = loadPrompts();

function isIsoTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function estimateTokens(text, isCode) {
  if (typeof text !== "string") {
    throw new TypeError("Token estimation text must be a string.");
  }
  if (typeof isCode !== "boolean") {
    throw new TypeError("Token estimation isCode must be a boolean.");
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const multiplier = isCode ? 1.3 : 1;
  const min = 0.75 * wordCount * multiplier;
  const max = 0.25 * text.length * multiplier;
  const highestEstimate = Math.max(min, max);
  const confidence =
    highestEstimate < 1000
      ? "high"
      : highestEstimate <= 5000
        ? "medium"
        : "low";

  return { min, max, confidence };
}

function trackModel(modelName, content, isCode = false) {
  if (typeof modelName !== "string" || !modelName.trim()) {
    throw new TypeError("Model name must be a non-empty string.");
  }
  if (modelName.length > 100) {
    throw new RangeError("Model name must be 100 characters or fewer.");
  }
  if (typeof content !== "string") {
    throw new TypeError("Prompt content must be a string.");
  }

  const timestamp = new Date().toISOString();
  return {
    model: modelName.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    tokenEstimate: estimateTokens(content, isCode),
  };
}

function updateTimestamps(metadata) {
  if (!metadata || typeof metadata !== "object") {
    throw new TypeError("Metadata must be an object.");
  }
  if (!isIsoTimestamp(metadata.createdAt)) {
    throw new TypeError(
      "Metadata createdAt must be a valid ISO 8601 timestamp.",
    );
  }

  const updatedAt = new Date().toISOString();
  if (Date.parse(updatedAt) < Date.parse(metadata.createdAt)) {
    throw new RangeError(
      "Metadata updatedAt must be greater than or equal to createdAt.",
    );
  }

  return { ...metadata, updatedAt };
}

function createLegacyMetadata(prompt) {
  const createdAt = new Date(prompt.createdAt || Date.now()).toISOString();
  return {
    model: prompt.model || "Unknown model",
    createdAt,
    updatedAt: isIsoTimestamp(prompt.updatedAt) ? prompt.updatedAt : createdAt,
    tokenEstimate: estimateTokens(prompt.content || "", Boolean(prompt.isCode)),
  };
}

function loadPrompts() {
  try {
    const savedPrompts = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(savedPrompts)
      ? savedPrompts.map((prompt) => ({
          ...prompt,
          metadata: prompt.metadata || createLegacyMetadata(prompt),
          rating: prompt.rating || 0,
          notes: Array.isArray(prompt.notes) ? prompt.notes : [],
        }))
      : [];
  } catch {
    return [];
  }
}

function savePrompts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
}

function validatePrompt(prompt, index = 0) {
  if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) {
    throw new Error(`Prompt ${index + 1} must be an object.`);
  }
  if (typeof prompt.id !== "string" || !SAFE_ID_PATTERN.test(prompt.id))
    throw new Error(`Prompt ${index + 1} is missing a valid ID.`);
  if (typeof prompt.title !== "string" || !prompt.title.trim())
    throw new Error(`Prompt ${index + 1} is missing a title.`);
  if (typeof prompt.content !== "string" || !prompt.content.trim())
    throw new Error(`Prompt ${index + 1} is missing content.`);
  if (!prompt.metadata || typeof prompt.metadata !== "object")
    throw new Error(`Prompt ${index + 1} is missing metadata.`);
  if (
    typeof prompt.metadata.model !== "string" ||
    !prompt.metadata.model.trim()
  )
    throw new Error(`Prompt ${index + 1} has invalid model metadata.`);
  if (
    !isIsoTimestamp(prompt.metadata.createdAt) ||
    !isIsoTimestamp(prompt.metadata.updatedAt)
  )
    throw new Error(`Prompt ${index + 1} has invalid timestamps.`);
  const tokenEstimate = prompt.metadata.tokenEstimate;
  if (
    !tokenEstimate ||
    typeof tokenEstimate !== "object" ||
    !Number.isFinite(tokenEstimate.min) ||
    !Number.isFinite(tokenEstimate.max) ||
    !CONFIDENCE_LEVELS.includes(tokenEstimate.confidence)
  )
    throw new Error(`Prompt ${index + 1} has an invalid token estimate.`);
  if (
    !Number.isInteger(prompt.rating) ||
    prompt.rating < 0 ||
    prompt.rating > 5
  )
    throw new Error(`Prompt ${index + 1} has an invalid rating.`);
  if (!Array.isArray(prompt.notes))
    throw new Error(`Prompt ${index + 1} has invalid notes.`);
  prompt.notes.forEach((note, noteIndex) => {
    if (
      !note ||
      typeof note !== "object" ||
      typeof note.id !== "string" ||
      !SAFE_ID_PATTERN.test(note.id) ||
      typeof note.content !== "string" ||
      !note.content.trim()
    )
      throw new Error(
        `Prompt ${index + 1} has an invalid note ${noteIndex + 1}.`,
      );
  });
}

function validatePromptCollection(candidate) {
  if (!Array.isArray(candidate))
    throw new Error("The prompts value must be an array.");
  const ids = new Set();
  candidate.forEach((prompt, index) => {
    validatePrompt(prompt, index);
    if (ids.has(prompt.id))
      throw new Error(`Duplicate prompt ID found: ${prompt.id}`);
    ids.add(prompt.id);
  });
  return candidate;
}

function getStatistics(items) {
  const modelCounts = items.reduce((counts, prompt) => {
    const model = prompt.metadata.model;
    counts[model] = (counts[model] || 0) + 1;
    return counts;
  }, {});
  const mostUsedModel =
    Object.entries(modelCounts).sort(
      (first, second) => second[1] - first[1],
    )[0]?.[0] || null;
  const averageRating = items.length
    ? Number(
        (
          items.reduce((total, prompt) => total + prompt.rating, 0) /
          items.length
        ).toFixed(2),
      )
    : 0;
  return { totalPrompts: items.length, averageRating, mostUsedModel };
}

function createExportData() {
  const storedData = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  validatePromptCollection(storedData);
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    statistics: getStatistics(storedData),
    prompts: storedData,
  };
}

function exportPrompts() {
  try {
    const blob = new Blob([JSON.stringify(createExportData(), null, 2)], {
      type: "application/json",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `prompt-library-${new Date().toISOString().replace(/[.:]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    window.alert(`Export failed: ${error.message}`);
  }
}

function validateExportData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("The file must contain a JSON object.");
  if (data.version !== EXPORT_VERSION)
    throw new Error(
      `Unsupported export version. Expected version ${EXPORT_VERSION}.`,
    );
  if (!isIsoTimestamp(data.exportedAt))
    throw new Error("The export timestamp is invalid.");
  if (!data.statistics || typeof data.statistics !== "object")
    throw new Error("The export statistics are missing.");
  return validatePromptCollection(data.prompts);
}

function mergePrompts(importedPrompts) {
  const existingIds = new Set(prompts.map((prompt) => prompt.id));
  const replacementIds = new Set();
  importedPrompts
    .filter((prompt) => existingIds.has(prompt.id))
    .forEach((prompt) => {
      if (
        window.confirm(
          `A prompt titled "${prompt.title}" already exists. Replace it?\n\nChoose Cancel to keep the existing version.`,
        )
      )
        replacementIds.add(prompt.id);
    });
  const importedById = new Map(
    importedPrompts.map((prompt) => [prompt.id, prompt]),
  );
  prompts = prompts
    .map((prompt) =>
      replacementIds.has(prompt.id) ? importedById.get(prompt.id) : prompt,
    )
    .concat(importedPrompts.filter((prompt) => !existingIds.has(prompt.id)));
}

function importPrompts(file) {
  const previousStorage = localStorage.getItem(STORAGE_KEY);
  const previousPrompts = prompts;
  localStorage.setItem(IMPORT_BACKUP_KEY, previousStorage || "[]");
  return file
    .text()
    .then((contents) => {
      let data;
      try {
        data = JSON.parse(contents);
      } catch {
        throw new Error("The selected file is not valid JSON.");
      }
      const importedPrompts = validateExportData(data).map((prompt) =>
        structuredClone(prompt),
      );
      if (
        window.confirm(
          "Replace your current library? Choose Cancel to merge the imported prompts.",
        )
      )
        prompts = importedPrompts;
      else mergePrompts(importedPrompts);
      validatePromptCollection(prompts);
      savePrompts();
      renderPrompts();
      window.alert(
        `Import complete: ${importedPrompts.length} prompt${importedPrompts.length === 1 ? "" : "s"} processed.`,
      );
    })
    .catch((error) => {
      prompts = previousPrompts;
      try {
        if (previousStorage === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, previousStorage);
      } catch {
        /* Keep the original prompts available in memory. */
      }
      renderPrompts();
      window.alert(`Import failed and was rolled back: ${error.message}`);
    })
    .finally(() => {
      localStorage.removeItem(IMPORT_BACKUP_KEY);
      importFileInput.value = "";
    });
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function renderPrompts() {
  prompts.sort(
    (first, second) =>
      Date.parse(second.metadata.createdAt) -
      Date.parse(first.metadata.createdAt),
  );
  promptCount.textContent = prompts.length;
  clearAllButton.hidden = prompts.length === 0;

  if (prompts.length === 0) {
    promptList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">+</div>
        <h3>Your library is waiting</h3>
        <p>Save your first prompt to see it here.</p>
      </div>
    `;
    return;
  }

  promptList.innerHTML = prompts
    .map(
      (prompt) => `
    <article class="prompt-card" data-card-id="${escapeHtml(prompt.id)}" tabindex="0" aria-expanded="false">
      <div class="prompt-card-header">
        <div>
          <h3>${escapeHtml(prompt.title)}</h3>
          <p class="prompt-card-preview">${escapeHtml(prompt.content)}</p>
        </div>
        <button class="delete-button" type="button" data-delete-id="${escapeHtml(prompt.id)}" aria-label="Delete ${escapeHtml(prompt.title)}">Delete</button>
      </div>
      <div class="prompt-card-summary">
        <span class="model-badge">${escapeHtml(prompt.metadata.model)}</span>
        <span class="summary-token">Tokens: ${formatTokenRange(prompt.metadata.tokenEstimate)}</span>
        <span class="summary-date">${formatDate(prompt.metadata.createdAt)}</span>
      </div>
      <div class="prompt-card-rating" aria-label="Rating ${escapeHtml(prompt.rating)} out of 5">
        ${renderRatingStars(prompt)}
      </div>
      <div class="prompt-card-details">
        <p class="prompt-card-content">${escapeHtml(prompt.content)}</p>
        <div class="prompt-card-meta">
          <span>Model: ${escapeHtml(prompt.metadata.model)}</span>
          <span>Created ${formatDate(prompt.metadata.createdAt)}</span>
          <span>Updated ${formatDate(prompt.metadata.updatedAt)}</span>
          <span>${prompt.content.length} characters</span>
        </div>
        <div class="token-estimate">
          <span>Estimated tokens: ${formatTokenRange(prompt.metadata.tokenEstimate)}</span>
          <span class="confidence-badge confidence-${escapeHtml(prompt.metadata.tokenEstimate.confidence)}">${escapeHtml(prompt.metadata.tokenEstimate.confidence)} confidence</span>
        </div>
        <div class="rating-row">
          <span class="rating-label">Effectiveness</span>
          <div class="rating-stars" role="group" aria-label="Rate ${escapeHtml(prompt.title)}">
            ${renderRatingStars(prompt)}
          </div>
        </div>
        ${renderNotes(prompt)}
      </div>
    </article>
  `,
    )
    .join("");
}

function formatTokenRange(tokenEstimate) {
  return `${Math.round(tokenEstimate.min)}-${Math.round(tokenEstimate.max)}`;
}

function renderRatingStars(prompt) {
  return Array.from({ length: 5 }, (_, index) => {
    const rating = index + 1;
    const isSelected = rating <= prompt.rating;

    return `<button class="star-button${isSelected ? " selected" : ""}" type="button" data-rating-id="${escapeHtml(prompt.id)}" data-rating-value="${rating}" aria-label="Rate ${rating} out of 5" aria-pressed="${isSelected}">${isSelected ? "★" : "☆"}</button>`;
  }).join("");
}

function renderNotes(prompt) {
  const editingNote = prompt.notes.find(
    (note) => note.id === prompt.editingNoteId,
  );

  const safeId = escapeHtml(prompt.id);

  return `
    <section class="notes-section" aria-labelledby="notes-title-${safeId}">
      <div class="notes-heading">
        <h4 id="notes-title-${safeId}">Notes</h4>
        <span>${prompt.notes.length}</span>
      </div>
      <div class="notes-list">
        ${prompt.notes.length === 0 ? '<p class="notes-empty">No notes yet.</p>' : prompt.notes.map((note) => renderNote(note, prompt, editingNote)).join("")}
      </div>
      <form class="note-form" data-note-form="${safeId}">
        <label class="sr-only" for="note-input-${safeId}">${editingNote ? "Edit note" : "Add a note"}</label>
        <textarea id="note-input-${safeId}" name="note" rows="2" maxlength="1000" placeholder="${editingNote ? "Update this note..." : "Add a note about this prompt..."}" required>${editingNote ? escapeHtml(editingNote.content) : ""}</textarea>
        <div class="note-form-actions">
          <button class="note-save-button" type="submit">${editingNote ? "Save changes" : "Save note"}</button>
          ${editingNote ? `<button class="note-cancel-button" type="button" data-cancel-note="${safeId}">Cancel</button>` : ""}
        </div>
      </form>
    </section>
  `;
}

function renderNote(note, prompt, editingNote) {
  if (editingNote?.id === note.id) {
    return "";
  }

  return `
    <article class="note-card">
      <p>${escapeHtml(note.content)}</p>
      <div class="note-card-footer">
        <span>Updated ${formatDate(note.updatedAt || note.createdAt)}</span>
        <div>
          <button class="note-action" type="button" data-edit-note="${escapeHtml(prompt.id)}" data-note-id="${escapeHtml(note.id)}">Edit</button>
          <button class="note-action note-delete-action" type="button" data-delete-note="${escapeHtml(prompt.id)}" data-note-id="${escapeHtml(note.id)}">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#039;",
        '"': "&quot;",
      })[character],
  );
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const model = modelInput.value.trim();
  const content = contentInput.value.trim();

  if (!title || !model || !content) return;

  try {
    prompts.unshift({
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
      title,
      content,
      metadata: trackModel(model, content, codeInput.checked),
      rating: 0,
      notes: [],
    });
  } catch (error) {
    window.alert(error.message);
    return;
  }

  savePrompts();
  renderPrompts();
  form.reset();
  updateCharacterCount();
  titleInput.focus();
});

promptList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-card-id]");
  const isCardAction = event.target.closest("button, textarea, input, form");
  if (card && !isCardAction) {
    const isExpanded = card.classList.toggle("is-expanded");
    card.setAttribute("aria-expanded", String(isExpanded));
    return;
  }

  const ratingButton = event.target.closest("[data-rating-id]");
  if (ratingButton) {
    const prompt = prompts.find(
      (item) => item.id === ratingButton.dataset.ratingId,
    );
    if (!prompt) return;

    prompt.rating = Number(ratingButton.dataset.ratingValue);
    prompt.metadata = updateTimestamps(prompt.metadata);
    savePrompts();
    renderPrompts();
    return;
  }

  const editButton = event.target.closest("[data-edit-note]");
  if (editButton) {
    const prompt = prompts.find(
      (item) => item.id === editButton.dataset.editNote,
    );
    if (!prompt) return;

    prompt.editingNoteId = editButton.dataset.noteId;
    renderPrompts();
    document.querySelector(`#note-input-${prompt.id}`)?.focus();
    return;
  }

  const cancelButton = event.target.closest("[data-cancel-note]");
  if (cancelButton) {
    const prompt = prompts.find(
      (item) => item.id === cancelButton.dataset.cancelNote,
    );
    if (!prompt) return;

    delete prompt.editingNoteId;
    renderPrompts();
    return;
  }

  const deleteNoteButton = event.target.closest("[data-delete-note]");
  if (deleteNoteButton) {
    if (!window.confirm("Delete this note?")) return;

    const prompt = prompts.find(
      (item) => item.id === deleteNoteButton.dataset.deleteNote,
    );
    if (!prompt) return;

    prompt.notes = prompt.notes.filter(
      (note) => note.id !== deleteNoteButton.dataset.noteId,
    );
    prompt.metadata = updateTimestamps(prompt.metadata);
    savePrompts();
    renderPrompts();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  if (!deleteButton) return;

  prompts = prompts.filter(
    (prompt) => prompt.id !== deleteButton.dataset.deleteId,
  );
  savePrompts();
  renderPrompts();
});

promptList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest("[data-card-id]");
  if (!card || event.target !== card) return;
  event.preventDefault();
  const isExpanded = card.classList.toggle("is-expanded");
  card.setAttribute("aria-expanded", String(isExpanded));
});

promptList.addEventListener("submit", (event) => {
  const noteForm = event.target.closest("[data-note-form]");
  if (!noteForm) return;

  event.preventDefault();
  const prompt = prompts.find((item) => item.id === noteForm.dataset.noteForm);
  const noteInput = noteForm.elements.note;
  const content = noteInput.value.trim();
  if (!prompt || !content) return;

  const existingNote = prompt.notes.find(
    (note) => note.id === prompt.editingNoteId,
  );

  if (existingNote) {
    existingNote.content = content;
    existingNote.updatedAt = Date.now();
  } else {
    prompt.notes.push({
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  prompt.metadata = updateTimestamps(prompt.metadata);
  delete prompt.editingNoteId;
  savePrompts();
  renderPrompts();
});

clearAllButton.addEventListener("click", () => {
  if (!window.confirm("Delete all saved prompts?")) return;
  prompts = [];
  savePrompts();
  renderPrompts();
});

exportButton.addEventListener("click", exportPrompts);
importButton.addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", () => {
  const [file] = importFileInput.files;
  if (file) importPrompts(file);
});

function updateCharacterCount() {
  characterCount.textContent = `${contentInput.value.length} character${contentInput.value.length === 1 ? "" : "s"}`;
}

contentInput.addEventListener("input", updateCharacterCount);
renderPrompts();
updateCharacterCount();

window.promptMetadata = { estimateTokens, trackModel, updateTimestamps };
