// Voice input logic: end-of-speech detection, recovery decisions, and app wiring.
// Microphone capture and real transcription are verified separately (see OVERNIGHT_PROGRESS.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../site/public/js/speech.js';
import '../site/public/js/voice-capture.js';

const { createEndpointer } = globalThis.RoveVoice;
const { recognitionFallback } = globalThis.RoveSpeech;
const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const run = (feed, levels) => { let last; for (const l of levels) { last = feed(l); if (last.done) return last; } return last; };
const frames = (ms, level) => Array(ms / 50).fill(level);

test('endpointer stops after speech followed by a pause, not during the speech', () => {
  const r = run(createEndpointer(), [...frames(300, 0.004), ...frames(1500, 0.08), ...frames(600, 0.005), ...frames(200, 0.07), ...frames(1300, 0.005)]);
  assert.equal(r.done, true);
  assert.equal(r.reason, 'silence');
  assert.equal(r.heard, true);
  const mid = run(createEndpointer(), [...frames(300, 0.004), ...frames(1500, 0.08), ...frames(600, 0.005)]);
  assert.equal(mid.done, false, 'a short pause mid-phrase does not end the recording');
});

test('endpointer reports no speech in a quiet room and caps long recordings', () => {
  const quiet = run(createEndpointer(), frames(8000, 0.004));
  assert.deepEqual([quiet.done, quiet.heard, quiet.reason], [true, false, 'no-speech']);
  const endless = run(createEndpointer(), [...frames(300, 0.004), ...frames(13000, 0.09)]);
  assert.equal(endless.reason, 'max');
});

test('endpointer adapts to a noisy station: steady noise is not mistaken for speech', () => {
  const r = run(createEndpointer(), [...frames(300, 0.03), ...frames(7000, 0.035)]);
  assert.equal(r.heard, false);
  const spoken = run(createEndpointer(), [...frames(300, 0.03), ...frames(1200, 0.2), ...frames(1300, 0.03)]);
  assert.equal(spoken.heard, true);
});

test('"network" while online is not reported as offline; on-device recognition is tried first', () => {
  assert.deepEqual(recognitionFallback({ error: 'network', onLine: true, availability: 'available' }), { action: 'retry-local', code: null });
  assert.deepEqual(recognitionFallback({ error: 'network', onLine: true, availability: 'downloadable' }), { action: 'offer-download', code: 'voice-download' });
  assert.deepEqual(recognitionFallback({ error: 'network', onLine: true, availability: 'unavailable' }), { action: 'fail', code: 'voice-service' });
  assert.deepEqual(recognitionFallback({ error: 'network', onLine: false, availability: 'unsupported' }), { action: 'fail', code: 'offline' });
  assert.deepEqual(recognitionFallback({ error: 'network', onLine: true, local: true, availability: 'available' }), { action: 'fail', code: 'voice-service' }, 'no retry loop');
  assert.deepEqual(recognitionFallback({ error: 'not-allowed' }), { action: 'fail', code: 'not-allowed' });
});

test('app prefers server transcription, falls back to the browser recognizer, then typing', () => {
  assert.ok(html.indexOf('voice-capture.js') < html.indexOf('app.js?'));
  // Rove's own service is used wherever the browser can record; a past failure is never remembered,
  // because the browser recognizer it fell back to fails in many browsers ("Voice service isn't responding").
  assert.match(app, /function voiceMode\(\) \{ return voiceServer !== false && window\.RoveVoice\?\.supported\(\) \? 'server' : 'browser'; \}/);
  assert.doesNotMatch(app, /localStorage\.setItem\('rove-voice-server-down'|VOICE_DOWN_KEY/);
  // Only a "not configured" answer switches to the browser; a dropped request is retried once.
  assert.match(app, /const notConfigured = body\?\.code === 'VOICE_UNAVAILABLE'/);
  assert.match(app, /if \(!notConfigured && !voiceRetried\)/);
  // A browser recognizer that cannot reach its cloud hands over to Rove's service.
  assert.match(app, /\['network', 'service-not-allowed', 'language-not-supported'\]\.includes\(error\) && voiceServer !== false/);
  assert.match(app, /if \(voiceMode\(\) === 'server'\) voiceViaServer\(\{ demo, leadIn: 200 \}\);\s*else \{ earcon\('start'\); setTimeout\(\(\) => voiceViaBrowser\(\{ demo \}\), 320\); \}/);
  assert.match(app, /fetch\('\/api\/v2\/transcribe', \{ method: 'POST'/);
  assert.match(app, /if \(BrowserRecognition\(\)\) \{ voiceServer = false; voiceViaBrowser/);
  assert.match(app, /RoveSpeech\.recognitionFallback\(/);
  assert.doesNotMatch(app, /Voice input needs an internet connection/, 'the misleading message is gone');
  assert.match(app, /offline: "You're offline/);
});

test('voice status is patched in place so VoiceOver focus does not move while the mic is open', () => {
  const start = app.indexOf('function updateVoiceSlot()');
  const body = app.slice(start, app.indexOf('\nfunction ', start + 10));
  assert.match(body, /slot\.innerHTML = voiceStatusHtml\(\)/);
  assert.match(app, /RoveVoice\.record\(\{ leadInMs: leadIn,/);
  assert.match(app, /await sayThenWait\(prompt \|\| \(demo \? 'Say your destination after the tone/, 'the prompt finishes before the microphone opens');
});

test('voice never asks the rider to download anything; it falls back to typing', () => {
  assert.match(app, /voiceFail\(step\.action === 'offer-download' \? 'voice-service' : step\.code, demo\);/);
});

test('voice works without sight: spoken prompts, sound cues, yes/no and start/next by voice', () => {
  assert.match(app, /Where would you like to go\? Say it after the tone\./);
  assert.match(app, /Say yes to go there, or no for the next match\./);
  assert.match(app, /Say start to begin this route/);
  for (const cue of ["earcon('start')", "earcon('stop')", "earcon('ok')", "earcon('error')"]) assert.ok(app.includes(cue), cue);
  // Silence: Rove asks again (twice) before suggesting typing.
  assert.match(app, /I didn't hear anything\. Where would you like to go\? Say it after the tone\./);
  assert.match(app, /const VOICE_REASKS = 2;/);
  const cap = readFileSync(new URL('../site/public/js/voice-capture.js', import.meta.url), 'utf8');
  assert.match(cap, /earcon, unlock \}\);/);
});

test('spoken requests are reduced to the place before searching', () => {
  const src = app.match(/function spokenDestination[\s\S]*?\n}\n/)[0];
  const spokenDestination = new Function(`${src}; return spokenDestination;`)();
  assert.equal(spokenDestination('Take me to Fruitvale, BART'), 'Fruitvale, BART');
  assert.equal(spokenDestination('I want to go to the Ferry Building, please.'), 'Ferry Building');
  assert.equal(spokenDestination('How do I get to SFO?'), 'SFO');
  assert.equal(spokenDestination('Going to Oakland'), 'Oakland');
  assert.equal(spokenDestination('Lake Merritt'), 'Lake Merritt');
});

test('Rove opens on one large Start button, then asks the destination out loud', () => {
  assert.match(app, /function showWake\(\)/);
  assert.match(app, /Tap anywhere to start/);
  assert.match(app, /window\.RoveVoice\?\.unlock\?\.\(\)/, 'the tap unlocks audio for later tones and the level meter');
  assert.match(app, /probeVoiceServer\(\);\n  showWake\(\);/);
  assert.match(app, /Say resume to continue it/);
  const cap = readFileSync(new URL('../site/public/js/voice-capture.js', import.meta.url), 'utf8');
  assert.match(cap, /function unlock\(\)/);
  assert.doesNotMatch(cap, /ctx\?\.close/, 'the shared audio context stays open between recordings');
});
