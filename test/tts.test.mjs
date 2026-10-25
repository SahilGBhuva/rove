// Natural voice: the /api/v2/tts endpoint and the speaker's natural-first, device-fallback behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateText, synthesize, MAX_TTS_CHARS } from '../api/v2/tts.mjs';
import '../site/public/js/speech.js';

const { createSpeaker } = globalThis.RoveSpeech;

test('tts accepts short text only', () => {
  assert.equal(validateText({ text: 'Where are you starting from?' }), null);
  assert.match(validateText({ text: '' }), /required/);
  assert.match(validateText({ text: 'x'.repeat(MAX_TTS_CHARS + 1) }), /at most/);
  assert.match(validateText(null), /JSON/);
});

test('tts reports a model that needs terms accepted as unavailable, without leaking the key', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: { code: 'model_terms_required' } }), { status: 400 });
  const r = await synthesize('Hi.', { key: 'secret', fetchImpl });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'TTS_UNAVAILABLE');
  assert.equal(r.body.upstream.type, 'model_terms_required');
  assert.doesNotMatch(JSON.stringify(r.body), /secret/);
  assert.equal((await synthesize('Hi.', {})).status, 503, 'no key: unavailable');
});

test('tts returns audio from the provider', async () => {
  const fetchImpl = async (url, init) => { assert.match(JSON.parse(init.body).model, /orpheus/); return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { 'content-type': 'audio/wav' } }); };
  const r = await synthesize('Hi.', { key: 'k', fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(r.contentType, 'audio/wav');
  assert.equal(r.audio.length, 4);
});

function fakeSynth() {
  const log = [];
  return { log, synth: { speaking: false, pending: false, paused: false, speak(u) { log.push(u.text); setTimeout(() => { u.onstart?.(); u.onend?.(); }, 0); }, cancel() {}, resume() {}, getVoices: () => [] } };
}
class Utterance { constructor(t) { this.text = t; } }
const wait = ms => new Promise(r => setTimeout(r, ms));

test('the natural voice speaks every part in order and reports done with the whole message', async () => {
  const played = [];
  const natural = { available: () => true, audio: async t => `audio:${t}`, play: async (a, onStart) => { onStart?.(); played.push(a); }, stop() {}, unlock() {} };
  const { synth, log } = fakeSynth();
  const s = createSpeaker({ synth, Utterance, natural });
  const states = []; s.onChange(st => states.push(`${st.state}:${st.text.length}`));
  const text = 'Route 1, arriving first, takes 1 hour 30 minutes. ' + 'Walk 18 minutes to Sunnyvale Caltrain. '.repeat(6);
  assert.equal(s.speak(text), 'started');
  await wait(20);
  assert.ok(played.length >= 2, 'long text is split into short parts');
  assert.equal(log.length, 0, 'the device voice is not used');
  assert.equal(s.status.state, 'done');
  assert.equal(s.status.text, text);
});

test('if the natural voice fails, the device voice says the rest (never silent)', async () => {
  const natural = { available: () => true, audio: async () => { throw new Error('tts 503'); }, play: async () => {}, stop() {}, unlock() {} };
  const { synth, log } = fakeSynth();
  const s = createSpeaker({ synth, Utterance, natural });
  s.speak('Where are you starting from?');
  await wait(20);
  assert.deepEqual(log, ['Where are you starting from?']);
  assert.equal(s.status.text, 'Where are you starting from?', 'status still names the whole prompt');
});

test('stop() silences the natural voice and does not fall back', async () => {
  let stopped = false, release;
  const natural = { available: () => true, audio: async t => t, play: () => new Promise((_, rej) => { release = rej; }), stop() { stopped = true; release?.(Object.assign(new Error('stopped'), { name: 'AbortError' })); }, unlock() {} };
  const { synth, log } = fakeSynth();
  const s = createSpeaker({ synth, Utterance, natural });
  s.speak('Long announcement.');
  await wait(5);
  s.stop();
  await wait(10);
  assert.ok(stopped);
  assert.equal(log.length, 0);
  assert.equal(s.status.state, 'stopped');
});

test('the most human-sounding device voice is preferred over a compact or novelty voice', () => {
  const { synth } = fakeSynth();
  const voices = [{ name: 'Fred', lang: 'en-US', localService: true, default: true }, { name: 'Samantha (Enhanced)', lang: 'en-US', localService: true }, { name: 'Zarvox', lang: 'en-US', localService: true }];
  synth.getVoices = () => voices;
  let used = null; synth.speak = u => { used = u.voice; };
  createSpeaker({ synth, Utterance }).speak('Hi.');
  assert.equal(used?.name, 'Samantha (Enhanced)');
});

test('the opening lines preloaded in the natural voice match what Rove actually says', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
  const list = JSON.parse(html.match(/window\.RovePreloadSpeech = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  assert.ok(list.length >= 2);
  for (const line of list) assert.ok(app.includes(`'${line}'`), `app.js says exactly: ${line}`);
  assert.ok(html.indexOf('RovePreloadSpeech') < html.indexOf('public/js/speech.js'), 'declared before speech.js loads');
});

test('"Speaking" is shown only once the natural voice is really playing', async () => {
  let start;
  const natural = { available: () => true, audio: async t => t, play: (a, onStart) => new Promise(res => { start = () => { onStart(); res(); }; }), stop() {}, unlock() {} };
  const { synth } = fakeSynth();
  const s = createSpeaker({ synth, Utterance, natural });
  s.speak('Where are you starting from?');
  await wait(5);
  assert.equal(s.status.state, 'starting', 'not "speaking" before sound starts');
  start(); await wait(5);
  assert.equal(s.status.state, 'done');
});

test('iPhone audio is routed to the loudspeaker for speech and only switched while the mic is open', async () => {
  const { readFileSync } = await import('node:fs');
  const speech = readFileSync(new URL('../site/public/js/speech.js', import.meta.url), 'utf8');
  const cap = readFileSync(new URL('../site/public/js/voice-capture.js', import.meta.url), 'utf8');
  assert.match(speech, /function audioSession\(type\)/);
  assert.match(speech, /play\(blob, onStart\) \{\s*audioSession\('playback'\);/);
  assert.match(cap, /audioSession\?\.\('play-and-record'\); \/\/ microphone open/);
  assert.match(cap, /audioSession\?\.\('playback'\); \/\/ microphone closed/);
  const silent = speech.match(/const SILENT = 'data:audio\/wav;base64,([^']+)'/)[1];
  assert.ok(Buffer.from(silent, 'base64').length > 1000, 'the unlock clip has real (silent) audio, not zero samples');
});

test('no "underwater" voice: the mic is opened without echo processing, and two voices never overlap', async () => {
  const { readFileSync } = await import('node:fs');
  const cap = readFileSync(new URL('../site/public/js/voice-capture.js', import.meta.url), 'utf8');
  const speech = readFileSync(new URL('../site/public/js/speech.js', import.meta.url), 'utf8');
  assert.match(cap, /echoCancellation: false/);
  assert.match(speech, /natural\.halt\?\.\(\); \/\/ never two voices at once/);
  assert.match(speech, /halt\(\) \{ try \{ el\.pause\(\); el\.removeAttribute\('src'\)/);
});
