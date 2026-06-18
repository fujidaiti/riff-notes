# Riff Notes

A browser-based step-sequencer / MIDI editor, built with TypeScript, React, and Vite.

This is a getting-started guide for developers. For architecture and conventions, see
[`CLAUDE.md`](./CLAUDE.md); for open work, see [`TODO.md`](./TODO.md).

## Prerequisites

- **Node.js 22+** and **npm 10+** (`node --version`, `npm --version`).

## Setup

```bash
git clone https://github.com/fujidaiti/riff-notes.git
cd riff-notes
npm install
```

## Running locally

```bash
npm run dev
```

Vite serves two entry points from one codebase:

- the editor at `http://localhost:5173/`
- the read-only embed viewer at `http://localhost:5173/embed.html`

State auto-persists to `localStorage` under `riff-notes:project`. To start from a clean slate,
clear that key in the browser's dev tools.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server (editor + embed viewer). |
| `npm run build` | Type-check (`tsc -b`) and build both entries to `dist/`. |
| `npm run preview` | Serve the production build from `dist/`. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run typecheck` | Type-check without emitting. |
| `npm run lint` | Run ESLint over `src/`. |

## Project layout

```
src/
  core/     Framework-agnostic, dependency-free logic. This is the test surface.
  state/    useReducer store, history (undo/redo), persistence.
  ui/        Presentational React shared by the editor and the embed viewer.
  audio/     WebAudio engine.
  editor/    Editor-only UI, interaction hooks, and dialogs.
  viewer/    Read-only embed viewer.
  main.tsx   Editor entry (index.html).
  embed.tsx  Viewer entry (embed.html).
legacy/     The original single-file app, kept as a behavioral reference.
```

Layering rule (enforced by ESLint): `core`, `ui`, `audio`, and `viewer` must **not** import from
`editor`, and `core` must not import React or any other layer. This keeps editor-only code out of
the embed bundle. Put new modules in the layer matching their dependencies. See `CLAUDE.md` for the
full rationale.

## Development workflow

1. Branch off `main`.
2. Make your change. Keep pure logic in `src/core` and add a co-located `*.test.ts` for it;
   keep DOM/audio/interaction code out of `core`.
3. Run the checks locally before pushing:
   ```bash
   npm run typecheck && npm run lint && npm test
   ```
4. Open a pull request. CI (`.github/workflows/health.yaml`) runs the same typecheck, lint, and
   test steps; both jobs must pass before merge.

### Testing notes

Tests run on Vitest in a Node environment (no jsdom) — `src/core` and `src/state` are the covered
surface. Components, audio, and interaction hooks are intentionally left untested; verify those by
running the app. A server-render smoke test guards that the editor and embed trees mount.

### Tips

- Don't hard-code cell sizes — read `--cell-w`/`--cell-h` via `useCellSize`; they are the single
  layout contract.
- Any change to the persisted shape must bump `SCHEMA_VERSION` in `src/core/serialize.ts` and update
  `serializeProject`/`deserializeProject` together.
