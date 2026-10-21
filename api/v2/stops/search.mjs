import { readFileSync } from 'node:fs';
import { StopSearch } from '../../../lib/stops-search.mjs';
import { AGENCIES } from '../../../lib/agencies.mjs';

let search;
function index() {
  if (!search) {
    const network = JSON.parse(readFileSync(new URL('../../../public/data/network.json', import.meta.url), 'utf8'));
    search = new StopSearch(network);
  }
  return search;
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({error: 'Method not allowed'});
  const url = new URL(req.url, 'https://rove.invalid');
  const q = (url.searchParams.get('q') || '').slice(0, 120);
  const rawLimit = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(25, Math.floor(rawLimit)) : 10;
  const filter = url.searchParams.get('agencies');
  const agencies = filter ? filter.split(',').filter(a => Object.hasOwn(AGENCIES, a)) : null;
  return res.status(200).json({ query: q, results: index().search(q, { limit, agencies }) });
}
