// Tests for api/v2/transcribe.mjs with a fake AI Gateway. No network, no credits.
import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { transcribeAudio, cleanTranscript, validateAudio, gatewayToken, MODEL, VOCABULARY_PROMPT } from '../api/v2/transcribe.mjs';

const audio = Buffer.from('fake-opus-audio').toString('base64');
const okFetch = (capture = {}) => async (url, init) => { capture.url = url; capture.init = init; return { ok: true, status: 200, json: async () => ({ text: ' Lake  Merritt. ', language: 'en', durationInSeconds: 1.4 }) }; };

function call(method, body, headers = { 'content-type': 'application/json' }) {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; return this; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } };
  return Promise.resolve(handler({ method, body, headers }, res)).then(() => res);
}

test('sends audio to the gateway with the transcription model, OIDC token and transit vocabulary', async () => {
  const cap = {};
  const r = await transcribeAudio({ audio, mediaType: 'audio/webm;codecs=opus' }, { token: 'oidc-token', fetchImpl: okFetch(cap) });
  assert.equal(r.status, 200);
  assert.equal(r.body.text, 'Lake Merritt');
  assert.equal(cap.url, 'https://ai-gateway.vercel.sh/v4/ai/transcription-model');
  assert.equal(cap.init.headers.Authorization, 'Bearer oidc-token');
  assert.equal(cap.init.headers['ai-model-id'], MODEL);
  const sent = JSON.parse(cap.init.body);
  assert.equal(sent.mediaType, 'audio/webm');
  assert.equal(sent.providerOptions.openai.language, 'en');
  assert.match(sent.providerOptions.openai.prompt, /Fruitvale/);
  assert.ok(VOCABULARY_PROMPT.length < 1200, 'prompt stays short');
});

test('gateway auth, credit and access failures become VOICE_UNAVAILABLE; busy and timeouts are distinct', async () => {
  for (const status of [401, 402, 403, 404]) {
    const r = await transcribeAudio({ audio, mediaType: 'audio/mp4' }, { token: 't', fetchImpl: async () => ({ ok: false, status, json: async () => ({}) }) });
    assert.equal(r.status, 503); assert.equal(r.body.code, 'VOICE_UNAVAILABLE');
  }
  const busy = await transcribeAudio({ audio, mediaType: 'audio/mp4' }, { token: 't', fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) });
  assert.equal(busy.body.code, 'VOICE_BUSY');
  const slow = await transcribeAudio({ audio, mediaType: 'audio/mp4' }, { token: 't', fetchImpl: async () => { throw new Error('timeout'); } });
  assert.equal(slow.status, 504);
  const none = await transcribeAudio({ audio, mediaType: 'audio/mp4' }, { token: null, fetchImpl: okFetch() });
  assert.equal(none.body.code, 'VOICE_UNAVAILABLE');
});

test('validates audio type, base64 and size before spending anything', () => {
  assert.equal(validateAudio({ audio, mediaType: 'audio/ogg;codecs=opus' }), null);
  assert.equal(validateAudio({ audio, mediaType: 'audio/mp4' }), null);
  assert.match(validateAudio({ audio, mediaType: 'video/mp4' }), /Unsupported/);
  assert.match(validateAudio({ audio: 'not base64!', mediaType: 'audio/webm' }), /base64/);
  assert.match(validateAudio({ audio: 'A'.repeat(3_000_000), mediaType: 'audio/webm' }), /too long/);
  assert.match(validateAudio(null), /required/);
});

test('handler: GET reports availability, rejects bad methods and content types', async () => {
  const get = await call('GET');
  assert.equal(get.statusCode, 200);
  assert.equal(typeof get.body.available, 'boolean');
  assert.equal(get.headers['Cache-Control'], 'no-store');
  assert.equal((await call('PUT')).statusCode, 405);
  assert.equal((await call('POST', {}, { 'content-type': 'text/plain' })).statusCode, 415);
  assert.equal((await call('POST', { audio: '', mediaType: 'audio/webm' })).statusCode, 400);
});

test('token comes from the Vercel OIDC header first, then env', () => {
  assert.equal(gatewayToken({ headers: { 'x-vercel-oidc-token': 'h' } }, { AI_GATEWAY_API_KEY: 'k' }), 'h');
  assert.equal(gatewayToken({ headers: {} }, { VERCEL_OIDC_TOKEN: 'o' }), 'o');
  assert.equal(gatewayToken({ headers: {} }, { AI_GATEWAY_API_KEY: 'k' }), 'k');
  assert.equal(gatewayToken({ headers: {} }, {}), null);
});

test('cleans transcripts', () => {
  assert.equal(cleanTranscript('  Take me to  Chase Center. '), 'Take me to Chase Center');
  assert.equal(cleanTranscript(undefined), '');
});

test('Groq (free Whisper) path sends a multipart upload with model, language and a short prompt', async () => {
  const { transcribeGroq, SHORT_PROMPT, GROQ_MODEL } = await import('../api/v2/transcribe.mjs');
  let sent;
  const r = await transcribeGroq({ audio, mediaType: 'audio/webm;codecs=opus' }, { key: 'gsk_test', fetchImpl: async (url, init) => { sent = { url, init }; return { ok: true, status: 200, json: async () => ({ text: ' Lake Merritt. ' }) }; } });
  assert.equal(r.status, 200);
  assert.equal(r.body.text, 'Lake Merritt');
  assert.equal(sent.url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(sent.init.headers.Authorization, 'Bearer gsk_test');
  assert.ok(sent.init.body instanceof FormData);
  assert.equal(sent.init.body.get('model'), GROQ_MODEL);
  assert.equal(sent.init.body.get('language'), 'en');
  assert.equal(sent.init.body.get('file').name, 'speech.webm');
  assert.ok(SHORT_PROMPT.split(/\s+/).length < 140, 'stays well under the 224-token Whisper prompt cap');
  const busy = await transcribeGroq({ audio, mediaType: 'audio/mp4' }, { key: 'k', fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) });
  assert.equal(busy.body.code, 'VOICE_BUSY');
  const bad = await transcribeGroq({ audio, mediaType: 'audio/mp4' }, { key: 'k', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
  assert.equal(bad.body.code, 'VOICE_UNAVAILABLE');
});
