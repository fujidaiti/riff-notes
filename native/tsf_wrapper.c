/*
 * Flat C ABI around TinySoundFont for the WebAudio worklet.
 *
 * We expose a tiny, single-instance surface (the worklet only ever needs one
 * synth) so the worklet can drive TSF directly through wasm exports without the
 * full Emscripten JS runtime. TSF_NO_STDIO drops the fopen path; we only ever
 * load from memory, so the wasm has no filesystem dependency.
 *
 * Built by `npm run build:tsf` (see native/README.md) into public/audio/tsf.wasm.
 */
#define TSF_IMPLEMENTATION
#define TSF_NO_STDIO
#include "TinySoundFont/tsf.h"

#include <emscripten.h>

// Single global synth instance — the worklet hosts exactly one.
static tsf* g_synth = 0;

// Load an SF2 from a buffer already copied into the wasm heap and configure
// stereo-interleaved output at the given sample rate. Returns 1 on success.
EMSCRIPTEN_KEEPALIVE
int tsf_w_load(const void* buffer, int size, int sampleRate) {
  if (g_synth) { tsf_close(g_synth); g_synth = 0; }
  g_synth = tsf_load_memory(buffer, size);
  if (!g_synth) return 0;
  tsf_set_output(g_synth, TSF_STEREO_INTERLEAVED, sampleRate, 0.0f);
  return 1;
}

// Global output gain (linear). Mirrors FluidSynth's setGain(0.8).
EMSCRIPTEN_KEEPALIVE
void tsf_w_set_volume(float volume) {
  if (g_synth) tsf_set_volume(g_synth, volume);
}

// Select SF2 bank + preset for a channel (GeneralUser GS uses bank 120 for drums).
EMSCRIPTEN_KEEPALIVE
void tsf_w_set_preset(int channel, int bank, int program) {
  if (g_synth) tsf_channel_set_bank_preset(g_synth, channel, bank, program);
}

EMSCRIPTEN_KEEPALIVE
void tsf_w_note_on(int channel, int key, float velocity) {
  if (g_synth) tsf_channel_note_on(g_synth, channel, key, velocity);
}

EMSCRIPTEN_KEEPALIVE
void tsf_w_note_off(int channel, int key) {
  if (g_synth) tsf_channel_note_off(g_synth, channel, key);
}

// Stop everything (used for panic / teardown).
EMSCRIPTEN_KEEPALIVE
void tsf_w_all_off(void) {
  if (g_synth) tsf_note_off_all(g_synth);
}

// MIDI controller change (we use CC7 = channel volume for the mixer).
EMSCRIPTEN_KEEPALIVE
void tsf_w_cc(int channel, int controller, int value) {
  if (g_synth) tsf_channel_midi_control(g_synth, channel, controller, value);
}

// Render `frames` stereo-interleaved sample frames into `buffer` (2*frames floats).
// Renders silence if no SoundFont is loaded yet.
EMSCRIPTEN_KEEPALIVE
void tsf_w_render(float* buffer, int frames) {
  if (g_synth) {
    tsf_render_float(g_synth, buffer, frames, 0);
  } else {
    for (int i = 0; i < frames * 2; i++) buffer[i] = 0.0f;
  }
}
