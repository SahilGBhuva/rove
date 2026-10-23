import { accessibleJourneys } from '../../../lib/accessibility/guidance.mjs';

/** Stateless, privacy-preserving guidance adapter for Vercel deployments. */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
    return res.status(415).json({ error: 'JSON request required', code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  const body = req.body;
  if (!body || Array.isArray(body) || !Array.isArray(body.itineraries) || body.itineraries.length > 10 || body.itineraries.some(it => !it || !Array.isArray(it.legs) || it.legs.length > 30)) {
    return res.status(400).json({ error: 'itineraries array (max 10 journeys, 30 legs each) required', code: 'BAD_REQUEST' });
  }
  return res.status(200).json(accessibleJourneys(body));
}
