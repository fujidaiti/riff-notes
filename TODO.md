# TODO

## React migration — remaining parity with `legacy/index.html`

These features exist in the legacy app and still need porting to `src/` (see
CLAUDE.md "Migration status"). Each should reuse `src/core` where possible:

- [ ] Audio engine + transport. Port WebAudio playback/scheduling, per-part +
      master gain (reuse `core/mixer.effectivePartGain`), `scheduleNote`/
      `scheduleDrum`, and `auditionNote` into `src/audio/AudioEngine.ts`. Keep
      the RAF playhead loop out-of-band (engine → ref), not through the reducer.
- [ ] Playhead rendering driven by the engine callback.
- [ ] Web-MIDI recording (count-in metronome, quantize, held-note tracking) as
      `src/editor/hooks/useMidiInput.ts`.
- [ ] Global rubber-band selection across bars (`useGlobalRubberBand`), porting
      the document-pointerdown bail-out allowlist; apply the single-part
      invariant from `core/selection`.
- [ ] Annotations UI: cards (hover-expand, drag-reposition, edge-resize), the
      editor dialog, and the polyline connectors. The DOM-based placement
      reconciliation (visual-position-preserving) belongs in the editor layer;
      the pure pruning is already in `core/notes`.
- [ ] Dialogs: mixer, quantize (wire `core/quantize`), part config, help. Use
      native `<dialog>` in a portal so the rubber-band allowlist's
      `closest("dialog")` keeps matching. Make a single `shortcuts.ts` the
      source for both the keyboard handler and the help table.
- [ ] Velocity cycling (modifier-click) and the hover tooltip / cell highlight.
- [ ] Save/Load JSON import-export UI (serialize boundary already exists).
- [ ] Bundle check: confirm the embed chunk pulls in no editor code.
- [ ] Phase 7 cutover: once parity is reached, remove `legacy/index.html`.

## Product follow-ups (carried over from the original app)

- [ ] Improve degree-name notation for out-of-scale pitches.
      Currently chromatic (non-scale) degrees are always shown with flats
      (`♭II`, `♭III`, `♭V`, `♭VI`, `♭VII`). Consider a clearer convention,
      e.g. context-aware sharps/flats based on neighboring scale tones,
      or leaving non-scale boundary pitches unlabeled.
- [ ] Indicate the key color of each pitch in a bar-grid to clarify which
      pitches are black keys or white keys.
