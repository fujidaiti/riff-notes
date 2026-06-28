/*
 * TinySoundFont AudioWorklet processor.
 *
 * Hosts a single TSF synth (compiled to wasm, see native/) and renders it block
 * by block. Deliberately minimal: it instantiates the wasm, holds a queue of
 * sample-tagged events, fires the due ones at the start of each render block,
 * and renders. Timing is block-granular (~2.9 ms at 44.1 kHz), which is
 * inaudible for a step sequencer — no sub-block splitting.
 *
 * The event-draining logic mirrors dueEvents() in src/core/audioSchedule.ts
 * (the tested source of truth). Worklets can't import from src/, so it's copied
 * here and kept trivial.
 */

class TsfProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.exports = null; // wasm exports once instantiated
    this.heapU8 = null; // Uint8Array view over wasm memory
    this.heapF32 = null; // Float32Array view over wasm memory
    this.renderPtr = 0; // wasm heap buffer for interleaved output
    this.renderFrames = 128; // render quantum
    this.loaded = false; // true once a SoundFont is loaded
    this.queue = []; // pending ScheduledEvent[]
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  // Refresh heap views — wasm memory may have been reallocated by growth.
  refreshHeap() {
    const buf = this.exports.memory.buffer;
    this.heapU8 = new Uint8Array(buf);
    this.heapF32 = new Float32Array(buf);
  }

  onMessage(msg) {
    switch (msg.type) {
      case "wasm": {
        // Compile inside the worklet from the raw bytes. Transferring a
        // WebAssembly.Module onto the audio render thread is not reliably
        // supported; synchronous compilation here is fine (small module, and
        // we're off the main thread).
        try {
          const wasmModule = new WebAssembly.Module(msg.bytes);
          const instance = new WebAssembly.Instance(wasmModule, {
            env: { emscripten_notify_memory_growth: () => this.refreshHeap() },
          });
          this.exports = instance.exports;
          this.refreshHeap();
          // Buffer for one render block (interleaved stereo floats).
          this.renderPtr = this.exports.malloc(this.renderFrames * 2 * 4);
          this.port.postMessage({ type: "ready" });
        } catch (err) {
          this.port.postMessage({ type: "error", stage: "wasm", message: String(err) });
        }
        break;
      }
      case "load": {
        // Copy the SF2 bytes into the wasm heap, load, then free the copy.
        const bytes = new Uint8Array(msg.sf2);
        const ptr = this.exports.malloc(bytes.length);
        this.heapU8.set(bytes, ptr);
        const ok = this.exports.tsf_w_load(ptr, bytes.length, msg.sampleRate);
        this.exports.free(ptr);
        if (msg.volume != null) this.exports.tsf_w_set_volume(msg.volume);
        this.loaded = !!ok;
        this.port.postMessage({ type: "loaded", ok: this.loaded });
        break;
      }
      case "setupChannels": {
        if (!this.loaded) break;
        for (const c of msg.channels) {
          this.exports.tsf_w_set_preset(c.channel, c.bank, c.program);
          if (c.cc7 != null) this.exports.tsf_w_cc(c.channel, 7, c.cc7);
        }
        break;
      }
      case "events": {
        // Append scheduled events (each tagged with an absolute sample index).
        for (const ev of msg.events) this.queue.push(ev);
        break;
      }
      case "ccNow": {
        // Immediate controller change (live mixer), not sample-scheduled.
        if (this.loaded) this.exports.tsf_w_cc(msg.channel, msg.controller, msg.value);
        break;
      }
      case "panic": {
        if (this.loaded) this.exports.tsf_w_all_off();
        this.queue.length = 0;
        break;
      }
      case "volume": {
        if (this.loaded) this.exports.tsf_w_set_volume(msg.volume);
        break;
      }
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const left = out[0];
    const right = out[1] || out[0];
    const frames = left.length;

    if (!this.exports || !this.loaded) {
      left.fill(0);
      if (right !== left) right.fill(0);
      return true;
    }

    // Fire events due within this block (atSample < blockEnd), keep the rest.
    if (this.queue.length) {
      const blockEnd = currentFrame + frames;
      const remaining = [];
      for (const ev of this.queue) {
        if (ev.atSample < blockEnd) this.applyEvent(ev);
        else remaining.push(ev);
      }
      this.queue = remaining;
    }

    // Render interleaved stereo into the wasm buffer, then de-interleave.
    this.exports.tsf_w_render(this.renderPtr, frames);
    const base = this.renderPtr >> 2; // float index
    const f32 = this.heapF32;
    for (let i = 0; i < frames; i++) {
      left[i] = f32[base + i * 2];
      right[i] = f32[base + i * 2 + 1];
    }
    return true;
  }

  applyEvent(ev) {
    switch (ev.kind) {
      case "on":
        this.exports.tsf_w_note_on(ev.channel, ev.key, ev.value);
        break;
      case "off":
        this.exports.tsf_w_note_off(ev.channel, ev.key);
        break;
      case "cc":
        this.exports.tsf_w_cc(ev.channel, ev.key, ev.value);
        break;
    }
  }
}

registerProcessor("tsf-processor", TsfProcessor);
