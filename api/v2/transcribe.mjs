/* Speech to text for destination entry, through Vercel AI Gateway.
 * The browser records a few seconds of audio (any MediaRecorder format) and posts it here as
 * base64; this function sends it to a transcription model and returns plain text.
 * Authentication: Vercel OIDC on deployments (no key in code), or AI_GATEWAY_API_KEY elsewhere.
 * Audio is not stored or logged by Rove. */
const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v4/ai/transcription-model';
export const MODEL = process.env.ROVE_TRANSCRIBE_MODEL || 'openai/gpt-4o-transcribe';
const MAX_AUDIO_BYTES = 2_000_000; // about a minute of Opus; destination phrases are a few seconds
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|mp3|wav|x-wav|m4a|x-m4a|aac|flac)$/;

/* Bias recognition toward Bay Area transit names that general models often mishear. */
export const VOCABULARY_PROMPT = 'A rider is saying a San Francisco Bay Area destination, address, landmark, or transit station. '
  + 'Examples: Embarcadero, Montgomery Street, Powell Street, Civic Center, 16th Street Mission, 24th Street Mission, Glen Park, Balboa Park, '
  + 'Daly City, Millbrae, SFO, Fruitvale, Lake Merritt, 12th Street Oakland City Center, 19th Street Oakland, MacArthur, Rockridge, '
  + 'Downtown Berkeley, El Cerrito del Norte, Dublin/Pleasanton, Warm Springs, Berryessa, San Jose Diridon, Tamien, Sunnyvale, '
  + 'Mountain View, Palo Alto, Hillsdale, 4th and King, Salesforce Transit Center, Ferry Building, Chase Center, Oracle Park, '
  + 'Judah, Taraval, Ocean Beach, Castro, Van Ness, Caltrain, BART, Muni, VTA, AC Transit.';

export function gatewayToken(req, env = process.env) {
  return req?.headers?.['x-vercel-oidc-token'] || env.VERCEL_OIDC_TOKEN || env.AI_GATEWAY_API_KEY || null;
}

/* "Lake Merritt." -> "Lake Merritt"; collapses whitespace; caps length. */
export function cleanTranscript(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().replace(/[.!?。]+$/u, '').slice(0, 200);
}

export function validateAudio(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'JSON body with audio and mediaType required';
  const mediaType = String(body.mediaType || '').split(';')[0].trim().toLowerCase();
  if (!AUDIO_TYPES.test(mediaType)) return 'Unsupported audio type';
  if (typeof body.audio !== 'string' || !body.audio || !/^[A-Za-z0-9+/=]+$/.test(body.audio)) return 'audio must be base64';
  if (body.audio.length * 0.75 > MAX_AUDIO_BYTES) return 'Recording is too long';
  return null;
}

/* Calls AI Gateway. Returns { status, body } so the handler and tests share one path. */
export async function transcribeAudio({ audio, mediaType }, { token, fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  if (!token) return { status: 503, body: { error: 'Voice transcription is not configured on this server.', code: 'VOICE_UNAVAILABLE' } };
  let response;
  try {
    response = await fetchImpl(GATEWAY_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'ai-gateway-protocol-version': '0.0.1',
        'ai-transcription-model-specification-version': '4',
        'ai-model-id': MODEL,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audio,
        mediaType: String(mediaType).split(';')[0].trim().toLowerCase(),
        providerOptions: { openai: { language: 'en', prompt: VOCABULARY_PROMPT } }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    return { status: 504, body: { error: 'The voice service took too long to respond.', code: 'VOICE_TIMEOUT' } };
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    // Auth, credit and model-access problems are server configuration, not the rider's fault.
    const unavailable = [401, 402, 403, 404].includes(response.status);
    // Upstream status and error type (never the token or audio) make configuration problems diagnosable.
    const upstream = { status: response.status, type: String(payload?.error?.type || payload?.error?.code || payload?.type || '').slice(0, 80) || null };
    return {
      status: unavailable ? 503 : response.status === 429 ? 429 : 502,
      body: { error: unavailable ? 'Voice transcription is not available right now.' : response.status === 429 ? 'The voice service is busy. Try again in a moment.' : 'The voice service could not understand the recording.', code: unavailable ? 'VOICE_UNAVAILABLE' : response.status === 429 ? 'VOICE_BUSY' : 'VOICE_FAILED', upstream }
    };
  }
  return { status: 200, body: { text: cleanTranscript(payload?.text), language: payload?.language || null, durationInSeconds: payload?.durationInSeconds ?? null, model: MODEL } };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET') return res.status(200).json({ available: Boolean(gatewayToken(req)), model: MODEL });
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }); }
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return res.status(415).json({ error: 'JSON request required', code: 'UNSUPPORTED_MEDIA_TYPE' });
  const invalid = validateAudio(req.body);
  if (invalid) return res.status(400).json({ error: invalid, code: 'BAD_AUDIO' });
  const result = await transcribeAudio(req.body, { token: gatewayToken(req) });
  return res.status(result.status).json(result.body);
}
