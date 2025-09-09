import express from 'express';
import { scrapeWongnai } from './scrapers/wongnai.js';
import { scrapeTripAdvisor } from './scrapers/tripadvisor.js';
import { scrapeFacebook } from './scrapers/facebook.js';
import { scrapeTikTok } from './scrapers/tiktok.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({ ok: true, endpoints: ['/scrape'] });
});

/**
 * POST /scrape
 * body:
 *  {
 *    place: { name, address, phone, zip, streetToken },
 *    sources: ["wongnai","tripadvisor","facebook","tiktok"],
 *    urls: {
 *      wongnai:   ["https://..."],
 *      tripadvisor:["https://..."],
 *      facebook:  ["https://facebook.com/xxx"],
 *    },
 *    queries: {
 *      tiktok: ["\"Longhua\" รีวิว", "\"Longhua\" review"]
 *    },
 *    limits: { perSource: 10 }
 *  }
 */
app.post('/scrape', async (req, res) => {
  const { place = {}, sources = [], urls = {}, queries = {}, limits = {} } = req.body || {};
  const { name: placeName = '' } = place;
  const perSource = Math.min(Math.max(Number(limits?.perSource || 10), 1), 50);

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

  try {
    const results = await Promise.all(tasks);
    const flat = results.flat();
    // limit ต่อ source
    const bySource = {};
    for (const r of flat) {
      bySource[r.source] ||= [];
      if (bySource[r.source].length < perSource) bySource[r.source].push(r);
    }
    const merged = Object.values(bySource).flat();
    res.json({
      ok: true,
      total: merged.length,
      sources: Object.fromEntries(Object.entries(bySource).map(([k,v]) => [k, v.length])),
      items: merged
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('review-scraper server up');
});
