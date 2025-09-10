// server.js
import express from 'express';
import cors from 'cors';

import { scrapeWongnai } from './scrapers/wongnai.js';
import { scrapeTripAdvisor } from './scrapers/tripadvisor.js';
import { scrapeFacebook } from './scrapers/facebook.js';
import { scrapeTikTok } from './scrapers/tiktok.js';

const app = express();

// basic middlewares
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// health & index
app.get('/', (_req, res) => {
  res.json({ ok: true, endpoints: ['/health', '/scrape'] });
});
app.get('/health', (_req, res) => res.send('ok'));

// ---- small helpers (no TH tokens here) ----
function dedupeReviews(items = []) {
  const seen = new Set();
  const out = [];
  for (const r of items) {
    const key = [
      r?.source || '',
      r?.sourceUrl || '',
      (r?.text || '').slice(0, 160)
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function limitPerSource(items = [], perSource = 10) {
  const bySource = {};
  for (const r of items) {
    const src = r?.source || 'unknown';
    bySource[src] ||= [];
    if (bySource[src].length < perSource) bySource[src].push(r);
  }
  return { flat: Object.values(bySource).flat(), counts: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, v.length])) };
}

/**
 * POST /scrape
 * body:
 * {
 *   place: { name, address, phone, zip, streetToken },
 *   sources: ["wongnai","tripadvisor","facebook","tiktok"],
 *   urls:    { wongnai:[...], tripadvisor:[...], facebook:[...] },
 *   queries: { tiktok:[...] },
 *   limits:  { perSource: 10 }
 * }
 */
app.post('/scrape', async (req, res) => {
  try {
    const { place = {}, sources = [], urls = {}, queries = {}, limits = {} } = req.body || {};
    const placeName = place?.name || '';
    const perSource = Math.min(Math.max(Number(limits?.perSource || 10), 1), 50);

    if (!Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ ok: false, error: 'sources[] is required' });
    }

    // build scraping tasks (no country/category filtering here)
    const tasks = [];
    if (sources.includes('wongnai')) {
      tasks.push(scrapeWongnai({ urls: urls?.wongnai || [], placeName }));
    }
    if (sources.includes('tripadvisor')) {
      tasks.push(scrapeTripAdvisor({ urls: urls?.tripadvisor || [], placeName }));
    }
    if (sources.includes('facebook')) {
      tasks.push(scrapeFacebook({ urls: urls?.facebook || [], placeName }));
    }
    if (sources.includes('tiktok')) {
      tasks.push(scrapeTikTok({ queries: queries?.tiktok || [], placeName }));
    }

    const results = await Promise.all(tasks);
    const flat = results.flat();

    // dedupe (by source + sourceUrl + first 160 chars of text)
    const deDuped = dedupeReviews(flat);

    // cap per source
    const { flat: capped, counts } = limitPerSource(deDuped, perSource);

    // sort newest first if publishedAt is present
    capped.sort((a, b) => {
      const ta = a?.publishedAt ? Date.parse(a.publishedAt) : 0;
      const tb = b?.publishedAt ? Date.parse(b.publishedAt) : 0;
      return tb - ta;
    });

    res.json({
      ok: true,
      total: capped.length,
      sources: counts,
      items: capped
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('review-scraper server up on :' + port);
});
