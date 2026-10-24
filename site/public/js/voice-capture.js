/* Rove voice capture: records a short spoken destination in any modern browser (MediaRecorder:
 * iPhone Safari, Chrome, Firefox, Edge) and stops on its own when the rider stops talking.
 * The recording is sent to Rove's transcription endpoint; nothing is stored in the browser.
 * A short beep marks "speak now" so screen-reader speech is not captured before it. */
(function (root) {
  'use strict';
  const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/aac'];

  function supported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof root.MediaRecorder === 'function';
  }
  function pickType() {
    const MR = root.MediaRecorder;
    return TYPES.find(t => { try { return MR.isTypeSupported?.(t); } catch { return false; } }) || '';
  }

  /* Pure end-of-speech detector, fed one RMS level per frame. Exported for tests.
   * Learns the room's noise floor first, then waits for speech followed by silence. */
  function createEndpointer({ frameMs = 50, calibrateMs = 300, silenceMs = 1200, noSpeechMs = 7000, maxMs = 12000, minSpeechMs = 250 } = {}) {
    let t = 0, floor = Infinity, calibrated = false, speechMs = 0, quietMs = 0, heard = false;
    return function feed(rms) {
      t += frameMs;
      if (!calibrated) { floor = Math.min(floor, rms); if (t >= calibrateMs) calibrated = true; return { done: false, heard }; }
      const threshold = Math.max(0.015, floor * 3.5);
      if (rms > threshold) { speechMs += frameMs; quietMs = 0; if (speechMs >= minSpeechMs) heard = true; }
      else { quietMs += frameMs; floor = floor * 0.98 + rms * 0.02; }
      if (heard && quietMs >= silenceMs) return { done: true, heard, reason: 'silence' };
      if (!heard && t >= noSpeechMs) return { done: true, heard, reason: 'no-speech' };
      if (t >= maxMs) return { done: true, heard, reason: 'max' };
      return { done: false, heard };
    };
  }

  function beep(ctx, freq = 880, ms = 140) {
    try {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = freq; gain.gain.value = 0.0001;
      osc.connect(gain).connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
      osc.start(now); osc.stop(now + ms / 1000 + 0.02);
    } catch { /* audio output unavailable; visual and spoken cues still apply */ }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  const aborted = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });

  /* Starts recording. Call directly from a tap (iOS needs the gesture for audio).
   * Returns { stop(), cancel(), done }; done resolves to { blob, mediaType, heard, reason } or
   * rejects with the browser's error (NotAllowedError, NotFoundError, ...) or an AbortError.
   * onState('waiting' | 'listening') reports progress. */
  function record({ leadInMs = 700, onState } = {}) {
    const Ctx = root.AudioContext || root.webkitAudioContext;
    let ctx = null;
    try { ctx = Ctx ? new Ctx() : null; ctx?.resume?.(); } catch { ctx = null; } // inside the tap for iOS
    let stream = null, recorder = null, timer = null, cancelled = false, settle = null;
    const chunks = [];
    const cleanup = () => {
      clearInterval(timer); clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      setTimeout(() => { try { ctx?.close?.(); } catch { /* already closed */ } }, 300);
    };
    const done = new Promise((resolve, reject) => {
      settle = { resolve, reject };
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(s => {
        stream = s;
        if (cancelled) { cleanup(); reject(aborted()); return; }
        onState?.('waiting');
        setTimeout(() => {
          if (cancelled) return;
          if (ctx) beep(ctx);
          const type = pickType();
          try { recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined); }
          catch (error) { cleanup(); reject(error); return; }
          let result = { heard: true, reason: 'manual' };
          recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
          recorder.onstop = () => {
            cleanup();
            if (cancelled) { reject(aborted()); return; }
            const mediaType = (recorder.mimeType || type || 'audio/webm').split(';')[0];
            resolve({ blob: new Blob(chunks, { type: mediaType }), mediaType, heard: result.heard, reason: result.reason });
          };
          recorder.start();
          onState?.('listening');
          if (ctx) {
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            ctx.createMediaStreamSource(stream).connect(analyser);
            const data = new Float32Array(analyser.fftSize);
            const feed = createEndpointer();
            timer = setInterval(() => {
              analyser.getFloatTimeDomainData(data);
              let sum = 0; for (const v of data) sum += v * v;
              const step = feed(Math.sqrt(sum / data.length));
              if (step.done && recorder.state === 'recording') { result = step; recorder.stop(); }
            }, 50);
          } else {
            timer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 6000);
          }
        }, leadInMs);
      }, error => { cleanup(); reject(error); });
    });
    return {
      done,
      stop() { if (recorder?.state === 'recording') recorder.stop(); },
      cancel() {
        cancelled = true;
        if (recorder?.state === 'recording') recorder.stop();
        else { cleanup(); settle?.reject(aborted()); }
      }
    };
  }

  root.RoveVoice = Object.freeze({ supported, pickType, record, blobToBase64, createEndpointer });
})(typeof globalThis !== 'undefined' ? globalThis : window);
