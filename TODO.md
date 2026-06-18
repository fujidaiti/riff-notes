# TODO

## React migration

The migration from `legacy/index.html` to `src/` has reached feature parity for all the major
features (see CLAUDE.md "Migration status"): audio + transport + playhead, mixer, parts/drums,
velocity cycling, quantize, rubber-band selection, annotations, JSON save/load, help, and Web-MIDI
recording. The legacy file is kept as an archived reference.

Remaining:

- [ ] Manual browser QA pass against `legacy/index.html`, then delete the legacy file (Phase 7
      cutover). Automated checks (Vitest, tsc, build, an SSR smoke test) pass, but no browser run
      has been done in CI.
- [ ] Hover cell tooltip showing pitch/step under the cursor (minor polish).
- [ ] Recording extras from the legacy app: per-take BPM override, auto-expand bars on overflow,
      append mode, and silencing the armed part's existing notes while punching in over a backing
      track (the current take records over a metronome only).

## Product follow-ups (carried over from the original app)

- [ ] Improve degree-name notation for out-of-scale pitches.
      Currently chromatic (non-scale) degrees are always shown with flats
      (`♭II`, `♭III`, `♭V`, `♭VI`, `♭VII`). Consider a clearer convention,
      e.g. context-aware sharps/flats based on neighboring scale tones,
      or leaving non-scale boundary pitches unlabeled.
- [ ] Indicate the key color of each pitch in a bar-grid to clarify which
      pitches are black keys or white keys.
