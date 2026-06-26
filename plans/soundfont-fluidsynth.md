# Development Plan: GeneralUser GS + FluidSynth for Drums & E-piano

> Status: planning. This is a **development plan**, not an implementation plan — it
> defines goals, decisions, phases, and risks. It deliberately avoids prescribing
> code.

## 1. Goal & scope

**Short-term goal:** Replace the hand-written JS oscillator/noise synthesis for the
**E-piano** and **Drums** instruments with SoundFont playback — rendering GM presets
from [GeneralUser GS](https://www.schristiancollins.com/generaluser) through a
[FluidSynth](https://www.fluidsynth.org/) engine running in the browser.

### In scope
- Swap `scheduleNote` (epiano) and `scheduleDrum` (drums) for SoundFont-rendered voices.
- Keep everything else identical: timing/looping, pause/resume, playhead, mixer
  (mute/solo/volume), note audition, metronome click, undo/redo, serialization.
- Both entry points — editor (`index.html`) and embed viewer (`view.html`) — since
  `AudioEngine` is shared.

### Explicitly out of scope (for now)
- Adding new selectable GM instruments. The architecture should *allow* it later, but
  the UI still exposes only `epiano` + `drum`.
- Changing the persisted project schema, note model, or UI (aside from the new
  16-part limit; see §6.2).
- Replacing the metronome click — it stays a plain oscillator.
- A single shared *live* synth instance across embedded iframes (not feasible; see §5).

## 2. Current state (what we're replacing)

- `src/audio/AudioEngine.ts` is the **single** WebAudio integration point (editor
  hooks, viewer transport, and MIDI recording all route through it).
- It builds a **sample-accurate schedule up front** against the WebAudio clock
  (`playInternal` loops notes, computes `when`/`dur`, calls
  `scheduleNote`/`scheduleDrum`).
- Per-part `GainNode`s under a master gain implement mixer mute/solo/volume via
  `setTargetAtTime` ramps.
- The playhead is derived purely from `ctx.currentTime - t0` (no per-note callbacks);
  seamless looping re-schedules at the loop boundary.
- Instruments are modeled in `src/core/model/constants.ts`: `epiano` (pitched) and
  `drum` (fixed 3-row: hihat/snare/kick via `RHYTHM_KEYS`). Velocity already has a MIDI
  mapping (`VEL_MIDI`).

These are the invariants the new engine must preserve.

## 3. Confirmed decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Engine | **`js-synthesizer` — FluidSynth compiled to WASM**, running in an AudioWorklet. |
| 2 | Timing model | **FluidSynth's MIDI sequencer is the clock.** The playhead reads the sequencer's tick position (ticks → steps) instead of `ctx.currentTime - t0`. |
| 3 | SoundFont delivery | **Trim to only the presets we use** (one electric-piano program + one drum kit) and ship **SF3-compressed**. Target: a few hundred KB instead of ~30 MB. |
| 4 | Embed strategy | **SoundFont engine for both editor and viewer** (no JS-synth-only viewer path). |
| 5 | Cross-iframe sharing | **Immutable content-hashed HTTP caching + lazy init.** No shared live synth. |
| 6 | Part limit | **Max 16 parts per sheet** (one MIDI channel each; drums can live on any channel). |
| 7 | Reverb/chorus | **Light reverb, no chorus**, easy to toggle. |
| 8 | Metronome | Stays an oscillator (`click()` unchanged). |

## 4. Timing model (decision #2 in detail)

FluidSynth plays events in real time; the current engine pre-schedules on the audio
clock. We adopt FluidSynth's **internal MIDI sequencer** as the source of truth:

- Schedule timestamped note-on/note-off events into the sequencer.
- Derive `currentStep()` from the sequencer's tick position (map ticks → steps).
- Rebuild looping and pause/resume around sequencer transport rather than
  re-scheduling against `ctx.currentTime`.

**Nuance to bank:** there is a small, fixed latency between sequencer time and audible
output (worklet buffering). The playhead tracks **sequencer time**, which is the right
reference for "what is currently being played."

## 5. Cross-iframe resource sharing (decision #5 in detail)

The download/parse can be shared cheaply; a single live synth instance across iframes
cannot.

**What we will do (feasible, high value):**
- **HTTP-cache dedup.** Serve `.sf2`/`.wasm`/worklet as content-hashed, `immutable`,
  far-future `max-age` assets so the browser fetches each **once** across all iframes
  on a page and across visits.
- **Lazy init.** An embed does **not** boot the synth until the user presses play, so
  *N* idle iframes cost ≈ 0; only the interacted-with embed spins up a synth.
- **Optional later:** cache the compiled `WebAssembly.Module` in IndexedDB to skip
  recompilation per iframe.

**Why a single shared synth is not feasible:**
- `AudioContext`/`AudioWorklet` cannot live in a SharedWorker and cannot be shared
  across browsing contexts — each iframe needs its own context to make sound.
- Embeds may be cross-origin to one another or on a third-party host we don't control,
  so a shared parent or same-origin SharedWorker can't be relied on.

## 6. Key technical work areas

### 6.1 Per-part mixing
FluidSynth outputs one mixed stereo bus, so a post-synth `GainNode` can't isolate
parts. Map each part to a **distinct MIDI channel** and drive mute/solo/volume via
per-channel gain / **CC7/CC11**, preserving the current ramped behavior. Confirm
`js-synthesizer` exposes smooth per-channel control.

### 6.2 16-part limit
- No channel needs reserving: FluidSynth can make **any** channel a drum channel via
  bank-select (drum kits in bank 128), so parts map to channels 0–15 freely.
- **Creation:** the "add part" action refuses beyond 16, with UI feedback.
- **Load/import:** a project that already exceeds 16 is **clamped + warned** (extra
  parts open but are not played) so older projects still load. This is a constraint,
  not a schema-shape change, so no `SCHEMA_VERSION` bump.

### 6.3 Instrument → preset mapping
- epiano → a GM electric-piano program (exact GeneralUser GS program chosen in
  Phase 2).
- drum rows → GM percussion notes (kick 36, snare 38, closed hat 42).
- velocity → existing `VEL_MIDI`.
- Mapping lives in one place, extensible for future instruments.

### 6.4 Asset delivery
- Trim GeneralUser GS to required presets; ship SF3-compressed.
- Wire asset loading via Vite (`?url` / `public/`), respecting both entries and
  `base: "/riff-notes/"`.
- Async load (WASM compile + SF fetch) needs a loading state and must not block first
  paint or note audition.

### 6.5 Transport hygiene
- Stop/pause/loop-boundary must send **all-sound-off / all-notes-off** so sequencer
  voices don't hang (today's per-note `osc.stop()` teardown does this implicitly).

### 6.6 Reverb/chorus
- Enable FluidSynth's built-in reverb at a light setting, chorus off; expose a simple
  toggle.

## 7. Proposed phases

**Phase 0 — Spike / de-risk (timeboxed).**
Prove `js-synthesizer` loads (trimmed) GeneralUser GS in a Vite + AudioWorklet context
under `base: "/riff-notes/"`, plays a pitched note and a drum hit, and **confirm no
COOP/COEP headers are required** (verify a single-threaded, non-`SharedArrayBuffer`
build). Output: go/no-go + answers to the mixing and timing questions.

**Phase 1 — Engine abstraction.**
Introduce a "voice backend" seam in `src/audio` so `AudioEngine` talks to an interface
(note-on/off, drum hit, audition) instead of calling oscillator code directly. Keep the
current JS synth as the default backend — no behavior change, all checks green.

**Phase 2 — SoundFont backend.**
Implement the FluidSynth/`js-synthesizer` backend: WASM/worklet init, SoundFont load,
channel/preset mapping, velocity, and the sequencer-driven timing model.

**Phase 3 — Mixer & transport parity.**
Re-implement mute/solo/volume against MIDI channels/CCs; verify looping, pause/resume,
playhead accuracy, audition, metronome, and stuck-note hygiene match today.

**Phase 4 — Asset optimization & limits.**
Finalize trimmed/SF3 SoundFont + caching headers + lazy init; enforce the 16-part limit
at creation and load.

**Phase 5 — Verification & docs.**
Manual verification matrix (audio stays untested in Vitest); update `README.md` /
`CLAUDE.md`; add GeneralUser GS attribution/license.

## 8. Risks & open questions
- **COOP/COEP:** expected **not** required for single-threaded `js-synthesizer`
  (no `SharedArrayBuffer`); confirmed in Phase 0. This keeps third-party embedding
  simple.
- **Embed bundle weight:** mitigated by trimming + SF3 + lazy init; re-check the
  viewer's total footprint in Phase 4.
- **Playhead fidelity:** must stay smooth without per-note React renders, now sourced
  from sequencer ticks.
- **Per-channel mixer smoothness:** confirm CC/gain ramps match the current
  `setTargetAtTime` feel.
- **Licensing:** GeneralUser GS is free but requests attribution; trimming must
  preserve license terms.
- **Testing:** audio remains manual; consider a thin smoke test that the backend
  initializes.

## 9. Definition of done (short-term goal)
- E-piano and Drums play through GeneralUser GS via FluidSynth in both editor and embed.
- Timing, looping, pause/resume, playhead, mixer, audition, and metronome behave as
  before.
- SoundFont/WASM assets are trimmed, compressed, content-hashed, and cached; idle
  embeds incur ~no cost.
- 16-part limit enforced; older/over-limit projects still open (clamped + warned).
- Attribution/license included; docs updated.
