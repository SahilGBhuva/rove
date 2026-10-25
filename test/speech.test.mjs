// Logic tests for site/public/js/speech.js with a fake speech engine.
// These prove ordering, retention and failure reporting. They do NOT prove audio plays on an iPhone.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../site/public/js/speech.js';

const { chunk, createSpeaker } = globalThis.RoveSpeech;

/* A speech engine that can mimic WebKit quirks. mode: 'ok' | 'silent' | 'error' | 'dropAfterCancel' */
function fakeEnv(mode = 'ok') {
  const timers = [];
  const log = [];
  const synth = {
    speaking: false, pending: false, paused: false, queue: [], justCanceled: false,
    speak(u) {
      log.push(['speak', u.text]);
      if (mode === 'dropAfterCancel' && this.justCanceled) return; // WebKit drop: no events at all
      this.queue.push(u); this.pending = true;
    },
    cancel() { log.push(['cancel']); const q = this.queue; this.queue = []; this.speaking = this.pending = false; this.justCanceled = true; q.forEach(u => u.onerror?.({ error: 'canceled' })); },
    resume() { log.push(['resume']); this.paused = false; },
    // Test driver: play the head of the queue.
    tick() {
      this.justCanceled = false;
      const u = this.queue.shift();
      if (!u) return;
      if (mode === 'silent') { this.queue.unshift(u); return; }
      if (mode === 'error') { u.onerror?.({ error: 'synthesis-failed' }); return; }
      this.speaking = true; u.onstart?.(); u.onend?.();
      this.speaking = this.queue.length > 0; this.pending = this.queue.length > 0;
    }
  };
  class Utterance { constructor(text) { this.text = text; } }
  const env = {
    synth, Utterance,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
    isHidden: () => false
  };
  const runTimers = () => { const t = timers.splice(0); t.forEach(x => x.fn?.()); };
  return { env, synth, log, runTimers };
}

test('chunks long route summaries at sentence boundaries without losing words', () => {
  const text = Array.from({ length: 12 }, (_, i) => `Option ${i + 1}. Board the Muni N train toward Caltrain at Judah and La Playa, then transfer to BART.`).join(' ');
  const parts = chunk(text);
  assert.ok(parts.length > 1);
  assert.ok(parts.every(p => p.length <= 220), 'every chunk fits');
  assert.equal(parts.join(' '), text.replace(/\s+/g, ' ').trim());
  assert.deepEqual(chunk('   '), []);
});

test('speaks synchronously inside the tap when nothing is playing (iOS gesture unlock)', () => {
  const { env, log } = fakeEnv();
  const s = createSpeaker(env);
  assert.equal(s.speak('Option 1. 42 minutes.'), 'started');
  assert.deepEqual(log[0], ['speak', 'Option 1. 42 minutes.'], 'speak() ran before returning, with no cancel first');
  assert.ok(!log.some(([op]) => op === 'cancel'));
});

test('replacing speech cancels only when busy, then speaks on the next tick (WebKit drop guard)', () => {
  const { env, synth, log, runTimers } = fakeEnv('dropAfterCancel');
  const s = createSpeaker(env);
  s.speak('First message that is still playing.');
  assert.equal(synth.pending, true);
  s.speak('Second message.');
  assert.deepEqual(log.slice(-1), [['cancel']], 'second speak waits for the next tick');
  synth.tick(); // engine settles after cancel
  runTimers();
  assert.deepEqual(log.at(-1), ['speak', 'Second message.']);
  synth.tick();
  assert.equal(s.status.state, 'done');
});

test('a silent engine is reported as a failure, never left looking like success', () => {
  const { env, runTimers } = fakeEnv('silent');
  const s = createSpeaker(env);
  const seen = [];
  s.onChange(st => seen.push(st.state));
  s.speak('Hello.');
  runTimers(); // watchdog fires
  assert.equal(s.status.state, 'failed');
  assert.equal(s.status.reason, 'no-start');
  assert.deepEqual(seen, ['starting', 'failed']);
});

test('genuine synthesis errors fail; interrupted and canceled do not', () => {
  const bad = fakeEnv('error');
  const s1 = createSpeaker(bad.env);
  s1.speak('Hello.');
  bad.synth.tick();
  assert.equal(s1.status.state, 'failed');
  assert.equal(s1.status.reason, 'synthesis-failed');

  const ok = fakeEnv();
  const s2 = createSpeaker(ok.env);
  s2.speak('Hello there.');
  s2.stop();
  assert.equal(s2.status.state, 'stopped', 'stop is not an error');
  ok.runTimers();
  assert.equal(s2.status.state, 'stopped', 'stale watchdog from stopped speech is ignored');
});

test('stale callbacks from earlier speech cannot change the current status', () => {
  const { env, synth, runTimers } = fakeEnv();
  const s = createSpeaker(env);
  s.speak('First.');
  const firstUtterance = synth.queue[0];
  s.speak('Second.');
  runTimers();
  firstUtterance.onend?.();
  firstUtterance.onerror?.({ error: 'synthesis-failed' });
  assert.equal(s.status.state, 'starting');
  synth.tick();
  assert.equal(s.status.state, 'done');
});

test('utterances are retained until speech ends, then released', () => {
  const { env, synth } = fakeEnv();
  const s = createSpeaker(env);
  s.speak('One. Two.'.repeat(60));
  assert.equal(s.retainedCount, 1);
  assert.equal(synth.queue.length, 1);
  while (synth.queue.length) synth.tick();
  assert.equal(s.retainedCount, 0);
});

test('repeated taps never stack overlapping speech', () => {
  const { env, synth, runTimers } = fakeEnv();
  const s = createSpeaker(env);
  for (let i = 0; i < 5; i++) { s.speak(`Tap ${i}.`); runTimers(); }
  assert.deepEqual(synth.queue.map(u => u.text), ['Tap 4.']);
});

test('paused speech is resumed before speaking; hidden pages and missing engines report clearly', () => {
  const { env, synth, log } = fakeEnv();
  synth.paused = true;
  createSpeaker(env).speak('Hi.');
  assert.ok(log.findIndex(([op]) => op === 'resume') < log.findIndex(([op]) => op === 'speak'));

  const hidden = fakeEnv();
  hidden.env.isHidden = () => true;
  assert.equal(createSpeaker(hidden.env).speak('Hi.'), 'failed');

  const none = createSpeaker({});
  assert.equal(none.speak('Hi.'), 'unsupported');
  assert.equal(none.status.state, 'unsupported');
  assert.equal(none.status.text, 'Hi.');
});

test('app.js speaks only through RoveSpeech, and the route-choice button stays concise', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /speechSynthesis|SpeechSynthesisUtterance/, 'no direct engine calls that bypass the iOS guards');
  assert.ok(html.indexOf('public/js/speech.js') < html.indexOf('app.js?'), 'speech module loads before app.js');
  assert.match(html, /id="speechBar"/);
  assert.match(app, /case 'access-all-routes': \{\s*const order = sortedItineraryIndexes\(\)\.slice\(0, 3\)/);
  assert.match(app, /routeChoiceSpeech\(its\[i\], n \+ 1\)/);
});
