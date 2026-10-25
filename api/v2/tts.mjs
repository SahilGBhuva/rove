/* Natural-sounding speech for Rove's voice (text to speech), through Groq's Orpheus model.
 * The browser sends one short sentence group (under 200 characters) and gets audio back.
 * Uses the same GROQ_API_KEY as transcription. Text is not stored or logged by Rove.
 * If this is unavailable, the browser falls back to the device's own voice. */
const GROQ_TTS_URL = 'https://api.groq.com/openai/v1/audio/speech';
export const TTS_MODEL = process.env.ROVE_TTS_MODEL || 'canopylabs/orpheus-v1-english';
export const TTS_VOICE = process.env.ROVE_TTS_VOICE || 'hannah';
export const MAX_TTS_CHARS = 200;

export function validateText(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'JSON body with text required';
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  if (!text) return 'text required';
  if (text.length > MAX_TTS_CHARS) return `text must be at most ${MAX_TTS_CHARS} characters`;
  return null;
}

/* Returns { status, audio?, contentType?, body? } so the handler and tests share one path. */
export async function synthesize(text, { key, voice = TTS_VOICE, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  if (!key) return { status: 503, body: { error: 'Natural voice is not configured on this server.', code: 'TTS_UNAVAILABLE' } };
  let response;
  try {
    response = await fetchImpl(GROQ_TTS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TTS_MODEL, voice, input: text, response_format: 'wav' }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    return { status: 504, body: { error: 'The voice service took too long to respond.', code: 'TTS_TIMEOUT' } };
  }
  if (!response.ok) {
    const info = await response.json().catch(() => null);
    const unavailable = [400, 401, 403, 404].includes(response.status);
    return { status: unavailable ? 503 : response.status === 429 ? 429 : 502, body: { error: 'Natural voice is not available right now.', code: response.status === 429 ? 'TTS_BUSY' : unavailable ? 'TTS_UNAVAILABLE' : 'TTS_FAILED', upstream: { provider: 'groq', status: response.status, type: String(info?.error?.code || info?.error?.type || '').slice(0, 80) || null } } };
  }
  const audio = Buffer.from(await response.arrayBuffer());
  return { status: 200, audio, contentType: response.headers.get('content-type') || 'audio/wav' };
}

/* Same text, same audio: keep recent results so repeated prompts do not spend the provider's
 * small rate limit (Groq Orpheus: about 10 requests a minute, 100 a day). Per server instance. */
const memo = new Map();
const MEMO_MAX = 200;

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET') { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ available: Boolean(process.env.GROQ_API_KEY), model: TTS_MODEL, voice: TTS_VOICE }); }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }); }
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return res.status(415).json({ error: 'JSON request required', code: 'UNSUPPORTED_MEDIA_TYPE' });
  const invalid = validateText(req.body);
  if (invalid) return res.status(400).json({ error: invalid, code: 'BAD_TEXT' });
  const text = req.body.text.replace(/\s+/g, ' ').trim();
  let result = memo.get(text);
  if (!result) {
    result = await synthesize(text, { key: process.env.GROQ_API_KEY });
    if (result.status === 200) { memo.set(text, result); if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value); }
  }
  if (result.status !== 200) { res.setHeader('Cache-Control', 'no-store'); return res.status(result.status).json(result.body); }
  // Rove's prompts repeat a lot ("Where are you starting from?"), so the browser may keep the audio.
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('Content-Type', result.contentType);
  return res.status(200).send(result.audio);
}
