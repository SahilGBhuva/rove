/* Rove speech output: one reliable path for every spoken message.
 *
 * Mobile WebKit behaviours this guards against:
 * - speak() right after cancel() can be dropped silently, so cancel only when something is
 *   actually queued, and start the replacement on the next tick.
 * - The first utterance must start inside a user gesture; when nothing is playing we speak
 *   synchronously from the tap.
 * - Utterances that are garbage-collected may never fire end/error, so every queued one is kept.
 * - Speech can be left paused after the page was backgrounded; resume() before speaking.
 * - Some devices accept speak() and produce no sound or events at all; a watchdog reports that
 *   instead of failing silently.
 * "interrupted" and "canceled" errors mean we (or the rider) stopped speech: not failures.
 */
(function (root) {
  'use strict';
  const MAX_CHUNK = 220;

  /* Splits text into sentence groups short enough for every engine to finish reliably. */
  function chunk(text, max = MAX_CHUNK) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [clean];
    const out = [];
    let cur = '';
    const add = piece => {
      if (cur && (cur + ' ' + piece).length > max) { out.push(cur); cur = ''; }
      cur = cur ? cur + ' ' + piece : piece;
    };
    for (const raw of sentences) {
      const s = raw.trim();
      if (!s) continue;
      if (s.length <= max) { add(s); continue; }
      for (const part of s.split(/(?<=[,;:])\s+/)) add(part);
    }
    if (cur) out.push(cur);
    return out;
  }

  /* env: { synth, Utterance, setTimeout, clearTimeout, isHidden() } (injected for tests). */
  function createSpeaker(env = {}) {
    const synth = env.synth;
    const Utterance = env.Utterance;
    const later = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    const clear = env.clearTimeout || (id => clearTimeout(id));
    const listeners = new Set();
    let generation = 0;
    let retained = [];
    let watchdog = null;
    let status = { state: 'idle', text: '' };

    const supported = () => Boolean(synth && typeof synth.speak === 'function' && typeof Utterance === 'function');
    const disarm = () => { if (watchdog) { clear(watchdog); watchdog = null; } };
    function set(next) {
      status = next;
      listeners.forEach(fn => { try { fn(status); } catch { /* a listener error never stops speech */ } });
    }

    function stop() {
      generation++;
      disarm();
      retained = [];
      if (supported() && (synth.speaking || synth.pending)) { try { synth.cancel(); } catch { /* already stopped */ } }
      if (status.state === 'speaking' || status.state === 'starting') set({ state: 'stopped', text: status.text });
    }

    /* Returns 'started' | 'unsupported' | 'empty' | 'failed'. Never throws. */
    function speak(text, opts = {}) {
      const message = String(text || '');
      const parts = chunk(message, opts.maxChunk);
      if (!parts.length) return 'empty';
      if (!supported()) { set({ state: 'unsupported', text: message }); return 'unsupported'; }
      if (env.isHidden?.()) { set({ state: 'failed', text: message, reason: 'hidden' }); return 'failed'; }
      const busy = Boolean(synth.speaking || synth.pending);
      const my = ++generation;
      disarm();
      retained = [];
      let started = false;
      set({ state: 'starting', text: message });
      const fail = reason => {
        if (my !== generation) return;
        disarm(); retained = [];
        set({ state: 'failed', text: message, reason });
      };
      const queue = () => {
        if (my !== generation) return;
        try { if (synth.paused) synth.resume(); } catch { /* resume unsupported */ }
        // Queue only one utterance at a time. Enqueuing an entire long route
        // narration can silently stall Chromium/WebKit speech engines.
        const speakPart = i => {
          if (my !== generation || i >= parts.length) return;
          const u = new Utterance(parts[i]);
          u.lang = opts.lang || 'en-US';
          u.rate = opts.rate || 0.95;
          u.onstart = () => {
            if (my !== generation || started) return;
            started = true; disarm();
            set({ state: 'speaking', text: message });
          };
          u.onend = () => {
            if (my !== generation) return;
            retained = [];
            if (i + 1 < parts.length) later(() => speakPart(i + 1), 80); // let browser finish releasing the previous utterance
            else set({ state: 'done', text: message });
          };
          u.onerror = e => {
            const err = e?.error || 'unknown';
            if (err === 'interrupted' || err === 'canceled') return;
            fail(err);
          };
          retained = [u];
          try { synth.speak(u); } catch { fail('exception'); }
        };
        speakPart(0);
        // Engines that accept speak() but never start are reported, not ignored.
        watchdog = later(() => { watchdog = null; if (my === generation && !started && !synth.speaking) fail('no-start'); }, opts.watchdogMs || 2500);
      };
      if (busy) { try { synth.cancel(); } catch { /* nothing to cancel */ } later(queue, 60); }
      else queue(); // Synchronous: still inside the rider's tap, which unlocks audio on iOS.
      return 'started';
    }

    return {
      speak, stop, supported,
      get status() { return status; },
      get retainedCount() { return retained.length; },
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
  }

  /* What to do when speech recognition fails. Chromium-based browsers report "network" both when
   * the device is offline and when their cloud speech service is unreachable while online (common
   * in Brave, Electron apps and some Chromium builds), so "network" alone must not be shown as
   * "you are offline". Newer Chromium can recognise speech on the device instead.
   * availability: result of SpeechRecognition.available({processLocally: true}), or 'unsupported'. */
  function recognitionFallback({ error, onLine = true, local = false, availability = 'unsupported' }) {
    const cloudUnreachable = error === 'network' || error === 'language-not-supported';
    if (!cloudUnreachable) return { action: 'fail', code: error || 'unknown' };
    if (!local && availability === 'available') return { action: 'retry-local', code: null };
    if (!local && (availability === 'downloadable' || availability === 'downloading')) return { action: 'offer-download', code: 'voice-download' };
    return { action: 'fail', code: onLine ? 'voice-service' : 'offline' };
  }

  const api = { chunk, createSpeaker, recognitionFallback };
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    api.speaker = createSpeaker({
      synth: window.speechSynthesis,
      Utterance: window.SpeechSynthesisUtterance,
      isHidden: () => document.hidden
    });
  }
  root.RoveSpeech = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : window);
