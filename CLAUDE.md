# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Riff Notes is a browser-based step-sequencer / "sheet grid MIDI editor". It is being migrated
from a single-file vanilla-JS app into a TypeScript + React + Vite project. The original app is
preserved at `legacy/index.html` as a behavioral reference until the React editor reaches full
feature parity; the new app lives under `src/`.

## Running

- `npm run dev` — start the Vite dev server (editor at `/`, read-only embed viewer at `/embed.html`).
- `npm run build` — type-check (`tsc -b`) and build both entries to `dist/`.
- `npm test` — run the Vitest suite (`npm run test:watch` to watch).
- `npm run lint` / `npm run typecheck` — ESLint / TypeScript checks.

State auto-persists to `localStorage` under `riff-notes:project` (new clean-break schema, v1;
the legacy `midi-editor:state` is intentionally not loaded).

## Architecture

Two Vite entry points share one `src/` tree: `index.html` → `src/main.tsx` (editor) and
`embed.html` → `src/embed.tsx` (read-only viewer / iframe target). Layering, from the inside out:

- **`src/core/`** — framework-agnostic, dependency-free, DOM-free. This is the test surface. Domain
  types/constants/factories (`model/`), music theory (`theory.ts`), sub-step timing math
  (`timing.ts`), quantization (`quantize.ts`), selection with the single-part invariant
  (`selection.ts`), clipboard copy/paste (`clipboard.ts`), note removal + annotation reconciliation
  (`notes.ts`), mixer gain math (`mixer.ts`), pitch-label collision geometry (`labels.ts`), drag math
  (`drag.ts`), and the persistence boundary (`serialize.ts`). Each module has a co-located
  `*.test.ts`.
- **`src/state/`** — `useReducer` store over the project. `reducer.ts` clones via the serialize
  boundary for history isolation and exposes a `MUTATE_SHEET` escape hatch the editor uses to commit
  core-computed results. `history.ts` is snapshot undo/redo (cap 200); `persistence.ts` is a thin
  debounced localStorage wrapper; `context.tsx` provides **split State/Dispatch contexts** to limit
  re-renders.
- **`src/ui/`** — presentational React shared by editor and viewer: the reusable `Grid` (absolute
  notes over CSS-gradient grid lines; attaches no handlers when `readOnly`), `Band`, `SheetView`, and
  `theme.css` (the `--cell-w`/`--cell-h` CSS variables are the single layout contract).
- **`src/audio/`** — `AudioEngine.ts`: a class encapsulating WebAudio (lazy context, master +
  per-part gain nodes reusing `core/mixer`, note/drum synthesis, looping, metronome click). The
  playhead is reported out-of-band via `currentStep()`, polled by `PlayheadLine`'s own rAF so 60fps
  motion never re-renders the note tree.
- **`src/editor/`** — editor-only: `App.tsx`, interaction hooks (`useGridInteraction` for
  select/drag/resize/create/velocity/rubber-band, `useKeyboardShortcuts`, `useTransport`,
  `useMidiRecording`), the dialogs (`dialogs/` — mixer, part config, quantize, help, annotation),
  `shortcuts.ts` (single source for the keyboard handler and the help table), `io.ts` (JSON
  save/load), and `platform.ts` (`isCreateModifier`/`IS_MAC`).
- **`src/viewer/`** — viewer-only: `EmbedApp.tsx` + `hydrate.ts` (loads a project from
  `window.__RIFF_PROJECT__` or a `?p=` base64url param).

### Hard rule (enforced by ESLint)
`src/core`, `src/ui`, `src/audio`, `src/viewer` must NOT import from `src/editor`. This keeps
editor-only code out of the embed bundle. `src/core` additionally may not import React or any other
layer. If you add a module, place it in the layer matching its dependencies.

## Domain model

`Project → Sheets → Parts → Notes`, with `Annotations` and a `Mix` per sheet. `STEPS_PER_BAR = 16`,
`SUB_PER_STEP = 4`. A drum (`instrument: "drum"`) part is a fixed 3-row lane reusing the note schema
(`pitch` is a row index; row = `part.hi - pitch`). Runtime/view state (selection, playhead) is never
serialized — it lives in `src/state`, separate from the `Project` types. See `src/core/model/types.ts`.

## Conventions

- Keep pure logic in `src/core` with tests; keep DOM/audio/interaction out of `src/core` and untested
  (the testing strategy is deliberately bounded — high-value pure modules only).
- Any change to the persisted shape must bump `SCHEMA_VERSION` in `serialize.ts` and update
  `serializeProject`/`deserializeProject` together (add a migration branch).
- Editor pixel layout multiplies by `cellW`/`cellH` read from the CSS vars via `useCellSize`; never
  hard-code cell sizes.

## Migration status

The React app has reached feature parity with `legacy/index.html` for: rendering, tabs/sheet meta,
note create/select/move/resize/delete, copy/cut/paste, undo/redo, the read-only embed, audio playback
+ transport + repeat, the playhead, mixer (mute/solo/volume), part management (add/delete/configure,
drums), velocity cycling, quantize, rubber-band selection across bars, annotations (create/edit/
delete/drag + connectors), JSON save/load, the help dialog, the hover cell tooltip, and Web-MIDI
recording with a metronome count-in (including per-take BPM override, auto-expand range, auto-append
bars, and punch-in over a backing track). `legacy/index.html` is retained as an archived behavioral
reference; it can be deleted once a manual browser QA pass confirms parity.
