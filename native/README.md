# Native audio (TinySoundFont → WASM)

The browser audio engine synthesizes with [TinySoundFont](https://github.com/schellingb/TinySoundFont)
(MIT), compiled to WebAssembly and driven from an AudioWorklet
(`public/audio/tsf-worklet.js`). This replaces the GPL-licensed FluidSynth so the
project can be shipped inside native (e.g. iOS) apps.

## Layout

- `TinySoundFont/` — upstream source as a **git submodule** (pinned commit). Run
  `git submodule update --init` after cloning.
- `tsf_wrapper.c` — a tiny flat C ABI around `tsf.h` (single global synth instance,
  no stdio). This is what we compile.
- The build output `public/audio/tsf.wasm` is committed so the app builds without
  the Emscripten toolchain; rebuild it only when the wrapper or the submodule changes.

## Rebuilding `tsf.wasm`

Requires the [Emscripten](https://emscripten.org/) toolchain (`emcc` on `PATH`;
`brew install emscripten` on macOS).

```bash
git submodule update --init   # once, to fetch TinySoundFont/tsf.h
npm run build:tsf             # → public/audio/tsf.wasm
```

The build produces a standalone wasm module whose only import is
`env.emscripten_notify_memory_growth` (the worklet provides it and refreshes its
heap views there). `malloc`/`free` and the `tsf_w_*` functions are exported.
