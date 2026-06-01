# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Riff Notes is a single-file, zero-dependency, browser-based step-sequencer / "sheet grid MIDI editor". The entire application — HTML, CSS, and JavaScript — lives in `index.html`. There is no build system, no package manager, no tests, and no server.

## Running

Open `index.html` directly in a browser (e.g. `open index.html` on macOS). State auto-persists to `localStorage` under `midi-editor:state`; "Save JSON" / "Load JSON" export and import the same serialized document.

There are no build, lint, or test commands.

## Architecture

All logic is inside one IIFE at the bottom of `index.html` (starts around line 381). Sections are delimited by `// ---------- ... ----------` banner comments. The big-picture model:

- **Project → Sheets → Bars → Notes**, with **Parts** as horizontal lanes within a sheet.
  - `project`: `{ name, sheets[] }`. Single top-level mutable singleton (line ~470).
  - `sheet`: `{ id, title, notes, bpm, scale:{root,mode}, pitchDisplay, parts[], bars[], + runtime/view state }`.
  - `part`: `{ id, name, lo, hi }` — a MIDI pitch range that defines a horizontal lane.
  - `bar`: `{ id, notes[], partNotes }` — `STEPS_PER_BAR = 16` steps per bar.
  - `note`: `{ id, partId, pitch, start, length, vel }` where `vel` indexes into `VEL_LABELS`/`VEL_MIDI`/`VEL_OPACITY`/`VEL_GAIN`.

- **Runtime vs persisted state are intentionally decoupled** (see comment at line ~476). View/selection state (`selectedNoteIds`, `selectedCell`, `partsPanelOpen`, `activeSheetId`, `playingSheetId`, etc.) is never serialized. `serializeProject` / `deserializeProject` are the only persistence boundary. `SCHEMA_VERSION` gates restore; bump it and add a migration branch on breaking changes.

- **Rendering**: imperative DOM construction via the `el(tag, attrs, ...children)` helper. `renderAll()` is the top-level re-render. Most user actions mutate the model then call `renderAll()` and `persist()` (debounced 300ms write to `localStorage`).

- **Interaction model**: pointer events, not click. A document-level `pointerdown` handler (around line 1864) drives **global rubber-band selection** across bars. It bails out for an allowlist of targets (`.toolbar`, `dialog`, `.tabstrip`, `INPUT`/`TEXTAREA`/`SELECT`/`OPTION`, `BUTTON`, anything inside a `<label>`, `.note`, `.grid-wrap`) and otherwise calls `preventDefault()`. **When adding any new interactive control to a sheet, verify it is covered by this allowlist — otherwise its native behavior (e.g. native `<select>` popup) will be suppressed.** Drag state lives in a single `drag` object whose `mode` field is one of `"move" | "resize-left" | "resize-right" | "empty-pending" | "rubber-band"` (see `handlePointerDown` and the `pointermove`/`pointerup` listeners around lines 1410–1520).

- **Audio**: WebAudio, lazily-constructed `AudioContext`. Playback is driven by a `requestAnimationFrame` loop (`playbackRaf`) plus pre-scheduled oscillators (`activeOscillators`); `playSheet`/`pausePlayback`/`resumePlayback`/`stopPlayback` manage the lifecycle. Velocity controls oscillator gain via `VEL_GAIN`.

- **Music theory**: `SCALES` (line ~397) maps mode name → pitch-class interval list; `SCALE_OPTIONS` is the UI ordering. `pitchDisplayName` switches between absolute note names (`PITCH_NAMES`) and scale-degree names (`DEGREE_NAMES`) per `sheet.pitchDisplay`.

- **Cross-platform modifier**: `isCreateModifier(ev)` returns `metaKey` on Mac, `ctrlKey` elsewhere (`IS_MAC` is sniffed from `navigator.platform`). Use this rather than checking modifiers directly when adding shortcuts.

## Conventions when editing `index.html`

- Keep everything in the one file. Do not introduce a build step, external dependencies, or split into modules unless explicitly asked.
- Treat the section banner comments as the file's table of contents; place new code in the matching section.
- Any change that affects the shape of persisted data must bump `SCHEMA_VERSION` and update `serializeProject` / `deserializeProject` together.
- Keyboard shortcuts must be added to both the `keydown` handler (around line 1816) and the help dialog table data so the `?` toolbar button stays in sync.

## Known follow-ups

`TODO.md` tracks open work (currently: better notation for chromatic degrees; key-color hinting in bar grids).
