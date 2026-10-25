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
    // Split only where a sentence mark is followed by a space, so "0.3 miles" stays whole.
    const sentences = clean.split(/(?<=[.!?])\s+/);
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
    const natural = env.natural || null;
    const Utterance = env.Utterance;
    const later = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    const clear = env.clearTimeout || (id => clearTimeout(id));
    const listeners = new Set();
    let generation = 0;
    let retained = [];
    let watchdog = null;
    let status = { state: 'idle', text: '' };
    let primed = false, primer = null, lastCancel = -Infinity;
    const now = env.now || (() => Date.now());
    const cancel = () => { try { synth.cancel(); } catch { /* nothing to cancel */ } lastCancel = now(); };

    const supported = () => Boolean(synth && typeof synth.speak === 'function' && typeof Utterance === 'function');
    const disarm = () => { if (watchdog) { clear(watchdog); watchdog = null; } };
    function set(next) {
      status = next;
      listeners.forEach(fn => { try { fn(status); } catch { /* a listener error never stops speech */ } });
    }

    function stop() {
      generation++;
      disarm();
      try { natural?.stop(); } catch { /* nothing playing */ }
      retained = [];
      if (supported() && (synth.speaking || synth.pending)) cancel();
      if (status.state === 'speaking' || status.state === 'starting') set({ state: 'stopped', text: status.text });
    }

    /* Returns 'started' | 'unsupported' | 'empty' | 'failed'. Never throws. */
    /* Natural voice first (when the server offers it), the device voice otherwise or on any failure. */
    function speak(text, opts = {}) {
      const message = String(text || '');
      if (!chunk(message).length) return 'empty';
      if (natural?.available?.() && !opts.device) return speakNatural(message, opts);
      return speakDevice(message, opts);
    }

    /* Plays the natural voice one short part at a time, fetching the next parts while one plays.
     * Status text is the whole message, so callers waiting for "this prompt is done" still work. */
    function speakNatural(message, opts) {
      const my = ++generation;
      disarm(); retained = [];
      if (supported() && (synth.speaking || synth.pending)) cancel();
      natural.stop();
      set({ state: 'starting', text: message });
      const parts = chunk(message, 190);
      const fetched = [];
      const get = i => (fetched[i] ||= natural.audio(parts[i]));
      (async () => {
        let played = 0;
        try {
          // All parts first, so one message is never half human voice and half device voice.
          const audios = await Promise.all(parts.map((_, i) => get(i)));
          if (my !== generation) return;
          for (; played < audios.length; played++) {
            await natural.play(audios[played], () => { if (my === generation && status.state !== 'speaking') set({ state: 'speaking', text: message }); });
            if (my !== generation) return;
          }
          set({ state: 'done', text: message });
        } catch (e) {
          if (my !== generation) return; // stopped on purpose
          dbg(`natural voice failed (${e?.message || e}); using device voice`);
          natural.halt?.(); // never two voices at once
          // Never go silent: say whatever is left with the device voice.
          speakDevice(parts.slice(played).join(' '), opts, message);
        }
      })();
      return 'started';
    }

    function speakDevice(text, opts = {}, label = null) {
      const message = String(text || '');
      const shown = label ?? message;
      const parts = chunk(message, opts.maxChunk);
      if (!parts.length) return 'empty';
      if (!supported()) { set({ state: 'unsupported', text: shown }); return 'unsupported'; }
      // Do NOT refuse when document.hidden: macOS Chrome and Dia report a visible but partly covered
      // window as hidden, and they speak normally there. Refusing here silenced Read route choices aloud.
      // Just cancelled (this tick) counts as busy: WebKit drops speak() straight after cancel().
      try { natural?.halt?.(); } catch { /* none */ }
      audioSession('playback');
      dbg(`device voice speak "${message.slice(0, 24)}"`);
      const justCancelled = now() - lastCancel < 50;
      const busy = Boolean(synth.speaking || synth.pending);
      const my = ++generation;
      disarm();
      retained = [];
      let started = false, retried = false;
      const voice = pickVoice();
      set({ state: 'starting', text: shown });
      const fail = reason => {
        if (my !== generation) return;
        disarm(); retained = [];
        set({ state: 'failed', text: shown, reason });
      };
      const queue = () => {
        if (my !== generation) return;
        try { if (synth.paused) synth.resume(); } catch { /* resume unsupported */ }
        parts.forEach((part, i) => {
          const u = new Utterance(part);
          u.lang = opts.lang || 'en-US';
          u.rate = opts.rate || 0.95;
          if (voice) u.voice = voice;
          u.onstart = () => {
            if (i === 0) dbg('device voice started');
            if (my !== generation || started) return;
            started = true; disarm();
            set({ state: 'speaking', text: shown });
          };
          u.onend = () => {
            if (my !== generation || i !== parts.length - 1) return;
            retained = [];
            set({ state: 'done', text: shown });
          };
          u.onerror = e => {
            const err = e?.error || 'unknown';
            dbg(`device voice error ${err}`);
            if (err === 'interrupted' || err === 'canceled') return;
            fail(err);
          };
          retained.push(u);
          try { synth.speak(u); } catch { fail('exception'); }
        });
        // Engines that accept speak() but never start are reported, not ignored.
        watchdog = later(() => {
          watchdog = null;
          if (my !== generation || started || synth.speaking) return;
          // Chromium can get stuck with speech queued but never started; one reset usually clears it.
          if (!retried) { retried = true; retained = []; cancel(); try { synth.resume(); } catch { /* unsupported */ } later(queue, 120); return; }
          fail('no-start');
        }, opts.watchdogMs || 2500);
      };
      if (busy) { cancel(); later(queue, 60); }
      else if (justCancelled) later(queue, 60);
      else queue(); // Synchronous: still inside the rider's tap, which unlocks audio on iOS.
      return 'started';
    }

    function pickVoice() {
      let voices = [];
      try { voices = synth.getVoices?.() || []; } catch { voices = []; }
      if (!voices.length) return null;
      // The most human-sounding English voice the device has: Apple Premium/Enhanced, Edge "Natural", Siri.
      const en = voices.filter(v => /^en[-_]?(US|GB|AU|CA|IE)?/i.test(v.lang || ''));
      const rank = v => (/premium/i.test(v.name) ? 40 : 0) + (/enhanced|natural|neural|siri/i.test(v.name) ? 30 : 0) + (/^en[-_]US/i.test(v.lang) ? 5 : 0) + (v.localService ? 3 : 0) + (/google/i.test(v.name) ? -2 : 0) + (/compact|novelty|bells|bad news|whisper|zarvox|trinoids|bahh|boing|bubbles|cellos|jester|organ|superstar|wobble|albert|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i.test(v.name) ? -100 : 0);
      const best = en.slice().sort((a, b) => rank(b) - rank(a))[0];
      if (best && rank(best) >= 30) return best;
      const def = voices.find(v => v.default);
      if (def && def.localService !== false) return null; // the default is fine
      return voices.find(v => v.localService && /^en[-_]US/i.test(v.lang)) || voices.find(v => v.localService && /^en/i.test(v.lang)) || null;
    }

    /* iPhone Safari only lets speech start inside a tap, and then for the rest of the visit.
     * Call this synchronously from the first tap: it speaks a silent utterance to unlock speech,
     * so prompts that start later (after a render, a timer or a network reply) are heard. */
    function prime() {
      if (primed || !supported()) return false;
      primed = true;
      try {
        if (synth.pending && !synth.speaking) cancel(); // anything queued before the tap would block
        try { if (synth.paused) synth.resume(); } catch { /* resume unsupported */ }
        try { natural?.unlock?.(); } catch { /* no audio element */ }
        primer = new Utterance(' ');
        primer.volume = 0;
        primer.lang = 'en-US';
        synth.speak(primer);
      } catch { /* the next speak still tries */ }
      return true;
    }

    return {
      speak, stop, supported, prime,
      get primed() { return primed; },
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

  /* iPhone Safari (16.4+): after the microphone has been used, page audio can be sent to the earpiece
   * at a whisper. 'playback' routes Rove's voice to the loudspeaker (and plays with the Silent switch
   * on); 'play-and-record' is set only while the microphone is open. No-op elsewhere. */
  /* Audio diagnostics: what really happened, for ?debug=1 on a phone. */
  function dbg(message) {
    try {
      const log = (root.__roveAudioLog ||= []);
      log.push(`${new Date().toISOString().slice(14, 23)} ${message}`);
      if (log.length > 40) log.shift();
      root.dispatchEvent?.(new Event('rove-audio-log'));
    } catch { /* never break speech for a log */ }
  }
  function audioSession(type) {
    dbg(`session ${type}`);
    try { const s = typeof navigator !== 'undefined' && navigator.audioSession; if (s && s.type !== type) s.type = type; } catch { /* unsupported */ }
  }

  /* Rove's natural (human-sounding) voice: short parts synthesized on the server (/api/v2/tts) and
   * played through one audio element, which the first tap unlocks on iPhone. Turns itself off for the
   * visit if the server says it is not available, so the device voice takes over without delay. */
  function naturalVoice() {
    if (typeof Audio === 'undefined' || typeof fetch === 'undefined') return null;
    const el = new Audio();
    el.preload = 'auto';
    let ok = null, rejectPlay = null, unlocking = null, pauseUntil = 0;
    const cache = new Map();
    const voice = {};
    fetch('/api/v2/tts', { cache: 'no-store' }).then(r => r.json()).then(j => {
      if (ok !== false) ok = j?.available === true;
      dbg(`natural voice ${ok ? 'available' : 'unavailable'}`);
      // Fetch Rove's fixed opening lines now, so the first question plays straight after the tap.
      // Preloading on every page open spent the small daily voice budget, so it is off.
    }).catch(() => { ok = false; });
    // A real 0.2 s silent clip: an empty one can fail to play on iPhone, leaving the player locked.
    const SILENT = 'data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUAGAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
    return Object.assign(voice, {
      // Groq allows only ~10 requests a minute for this voice; after a limit hit, use the device voice for a while.
      available: () => ok === true && Date.now() > pauseUntil,
      audio(text) {
        if (cache.has(text)) return Promise.resolve(cache.get(text));
        return fetch('/api/v2/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined })
          .then(async r => {
            dbg(`tts ${r.status} "${text.slice(0, 24)}"`);
            if (r.status === 429) { pauseUntil = Date.now() + 10 * 60e3; throw new Error('tts 429 (voice limit reached)'); }
            if (!r.ok) { if ([400, 403, 404, 503].includes(r.status)) ok = false; throw new Error(`tts ${r.status}`); }
            const blob = await r.blob();
            if (cache.size > 80) cache.delete(cache.keys().next().value);
            cache.set(text, blob);
            return blob;
          });
      },
      async play(blob, onStart) {
        audioSession('playback');
        // Let the first-tap unlock clip finish starting: stopping it early leaves the player locked on iPhone.
        if (unlocking) { await unlocking.catch(() => {}); unlocking = null; }
        return new Promise((resolve, reject) => {
          const url = URL.createObjectURL(blob);
          let timer = null;
          const clean = () => { clearTimeout(timer); el.onended = el.onerror = el.onplaying = null; rejectPlay = null; setTimeout(() => URL.revokeObjectURL(url), 1000); };
          rejectPlay = () => { clean(); reject(Object.assign(new Error('stopped'), { name: 'AbortError' })); };
          el.onplaying = () => { el.onplaying = null; dbg('audio playing'); onStart?.(); };
          el.onended = () => { dbg('audio ended'); clean(); resolve(); };
          el.onerror = () => { dbg(`audio error ${el.error?.code || ''}`); clean(); reject(new Error('audio-error')); };
          el.src = url;
          const started = el.play();
          timer = setTimeout(() => { if (el.paused && el.currentTime === 0) { dbg('audio did not start in 4 s'); clean(); reject(new Error('no-start')); } }, 4000);
          started?.then?.(() => dbg('play() ok'), () => {});
          started?.catch?.(e => { dbg(`play() rejected ${e?.name || e}`); clean(); reject(e); });
        });
      },
      stop() { if (!unlocking) { try { el.pause(); } catch { /* not playing */ } } rejectPlay?.(); },
      halt() { try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* nothing loaded */ } rejectPlay?.(); },
      unlock() {
        try {
          audioSession('playback');
          el.src = SILENT;
          unlocking = Promise.resolve(el.play()).then(() => dbg('unlock ok'), e => { dbg(`unlock failed ${e?.name || e}`); throw e; });
          unlocking.catch(() => {});
        } catch (e) { dbg(`unlock threw ${e?.name || e}`); }
      }
    });
  }

  const api = { chunk, createSpeaker, recognitionFallback, audioSession, dbg };
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    api.speaker = createSpeaker({
      synth: window.speechSynthesis,
      Utterance: window.SpeechSynthesisUtterance,
      isHidden: () => document.hidden,
      natural: naturalVoice()
    });
  }
  root.RoveSpeech = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : window);
