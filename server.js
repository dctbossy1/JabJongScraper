// server.js
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import PQueue from 'p-queue';

// --- scrapers ---
import { scrapeWongnai } from './scrapers/wongnai.js';
import { scrapeTripAdvisor } from './scrapers/tripadvisor.js';
import { scrapeFacebook } from './scrapers/facebook.js';
import { scrapeTikTok } from './scrapers/tiktok.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---------- config ----------
const SCRAPE_SECRET = process.env.SCRAPE_SECRET || ''; // ถ้าใช้ HMAC ให้ตั้งค่า
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const PER_SOURCE_MAX = Number(process.env.PER_SOURCE_MAX || 10);
const TASK_TIMEOUT_MS = Number(process.env.TASK_TIMEOUT_MS || 45_000);
const MAX_BATCH = Number(process.env.MAX_BATCH || 20);

// in-memory job store (ถ้าต้องการ durable ให้ย้ายไป Redis/DB)
const groupStore = new Map(); // jobGroupId -> { status:'running|done', results:[...], errors:[...], createdAt, callbackUrl }

// global queue กันโหลด
const queue = new PQueue({ concurrency: CONCURRENCY });

// ---------- utils ----------
function hmac(body) {
  if (!SCRAPE_SECRET) return '';
  return crypto.createHmac('sha256', SCRAPE_SECRET).update(body).digest('hex');
}
function verifyHmac(req, res, next) {
  if (!SCRAPE_SECRET) return next();
  const sig = req.headers['x-signature'] || '';
  const raw = JSON.stringify(req.body || {});
  const want = hmac(raw);
  if (sig !== want) return res.status(401).json({ ok: false, error: 'bad signature' });
  next();
}

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
  return {
    flat: Object.values(bySource).flat(),
    counts: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, v.length]))
  };
}

function sortByPublishedAtDesc(arr) {
  arr.sort((a, b) => {
    const ta = a?.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b?.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });
  return arr;
}

function withTimeout(promise, ms, label = 'task') {
  let timer;
  const t = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), t]);
}

function pickPlaceFields(place = {}) {
  // กันส่ง payload ใหญ่จาก Get Place: เอาเฉพาะที่ต้องใช้สร้าง query
  return {
    placeId: place.placeId || place.id || '',
    name: place.name || place.displayName?.text || '',
    address: place.address || place.formattedAddress || '',
    phone: place.phone || place.nationalPhoneNumber || '',
    lat: place.lat ?? place.location?.latitude ?? null,
    lng: place.lng ?? place.location?.longitude ?? null,
    googleMapsUri: place.googleMapsUri || '',
    websiteUri: place.websiteUri || ''
  };
}

// ---------- health ----------
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    endpoints: ['/health', '/scrape', '/scrape/start', '/scrape/status/:jobGroupId']
  });
});
app.get('/health', (_req, res) => res.send('ok'));

// ===================================================================
// 1) SYNC: POST /scrape  (สำหรับ 1 ร้าน — ใช้เหมือนเดิมได้)
// ===================================================================
/**
 * body:
 * {
 *   place: { name, address, phone, ... }      // จาก Get Place (ตัดฟิลด์ยาวๆ ออก)
 *   sources: ["wongnai","tripadvisor","facebook","tiktok"],
 *   urls:    { wongnai:[...], tripadvisor:[...], facebook:[...] },
 *   queries: { tiktok:[...] },
 *   limits:  { perSource: 10 }
 * }
 */
app.post('/scrape', verifyHmac, async (req, res) => {
  try {
    const { place = {}, sources = [], urls = {}, queries = {}, limits = {} } = req.body || {};
    if (!Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ ok: false, error: 'sources[] is required' });
    }
    const perSource = Math.min(Math.max(Number(limits?.perSource || PER_SOURCE_MAX), 1), 50);
    const placeName = place?.name || place?.displayName?.text || '';

    const tasks = [];
    if (sources.includes('wongnai')) {
      tasks.push(withTimeout(scrapeWongnai({ urls: urls?.wongnai || [], placeName }), TASK_TIMEOUT_MS, 'wongnai'));
    }
    if (sources.includes('tripadvisor')) {
      tasks.push(withTimeout(scrapeTripAdvisor({ urls: urls?.tripadvisor || [], placeName }), TASK_TIMEOUT_MS, 'tripadvisor'));
    }
    if (sources.includes('facebook')) {
      tasks.push(withTimeout(scrapeFacebook({ urls: urls?.facebook || [], placeName }), TASK_TIMEOUT_MS, 'facebook'));
    }
    if (sources.includes('tiktok')) {
      tasks.push(withTimeout(scrapeTikTok({ queries: queries?.tiktok || [], placeName }), TASK_TIMEOUT_MS, 'tiktok'));
    }

    const settled = await Promise.allSettled(tasks);
    const flat = settled
      .filter(s => s.status === 'fulfilled')
      .flatMap(s => s.value || []);

    const deDuped = dedupeReviews(flat);
    const { flat: capped, counts } = limitPerSource(deDuped, perSource);
    sortByPublishedAtDesc(capped);

    res.json({
      ok: true,
      place: pickPlaceFields(place),
      total: capped.length,
      sources: counts,
      items: capped
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ===================================================================
// 2) ASYNC: POST /scrape/start  (batch หลายร้าน + callback/polling)
// ===================================================================
/**
 * body:
 * {
 *   places: [ { ...from Get Place..., urls?, queries? }, ... ]   // ≤ MAX_BATCH
 *   sources: ["wongnai","tripadvisor","facebook","tiktok"],
 *   limits:  { perSource: 10 },
 *   callbackUrl: "https://<n8n>/webhook/line-callback",          // optional
 *   lang: "th"
 * }
 */
app.post('/scrape/start', verifyHmac, async (req, res) => {
  try {
    const { places = [], sources = [], limits = {}, callbackUrl = '', lang = 'th' } = req.body || {};
    if (!Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ ok: false, error: 'sources[] is required' });
    }
    if (!Array.isArray(places) || places.length === 0) {
      return res.status(400).json({ ok: false, error: 'places[] is required' });
    }
    if (places.length > MAX_BATCH) {
      return res.status(400).json({ ok: false, error: `too many places (max ${MAX_BATCH})` });
    }
    const perSource = Math.min(Math.max(Number(limits?.perSource || PER_SOURCE_MAX), 1), 50);

    const jobGroupId = `jg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    groupStore.set(jobGroupId, { status: 'running', results: [], errors: [], createdAt: Date.now(), callbackUrl });

    // enqueue per place
    await Promise.all(places.map(async (placeRaw) => {
      const place = pickPlaceFields(placeRaw);
      const placeName = place.name || '';
      const urls = placeRaw?.urls || {};
      const queries = placeRaw?.queries || {};

      return queue.add(async () => {
        try {
          const tasks = [];
          if (sources.includes('wongnai')) {
            tasks.push(withTimeout(scrapeWongnai({ urls: urls?.wongnai || [], placeName }), TASK_TIMEOUT_MS, 'wongnai'));
          }
          if (sources.includes('tripadvisor')) {
            tasks.push(withTimeout(scrapeTripAdvisor({ urls: urls?.tripadvisor || [], placeName }), TASK_TIMEOUT_MS, 'tripadvisor'));
          }
          if (sources.includes('facebook')) {
            tasks.push(withTimeout(scrapeFacebook({ urls: urls?.facebook || [], placeName }), TASK_TIMEOUT_MS, 'facebook'));
          }
          if (sources.includes('tiktok')) {
            tasks.push(withTimeout(scrapeTikTok({ queries: queries?.tiktok || [], placeName }), TASK_TIMEOUT_MS, 'tiktok'));
          }

          const settled = await Promise.allSettled(tasks);
          const flat = settled
            .filter(s => s.status === 'fulfilled')
            .flatMap(s => s.value || []);

          const deDuped = dedupeReviews(flat);
          const { flat: capped, counts } = limitPerSource(deDuped, perSource);
          sortByPublishedAtDesc(capped);

          // เก็บผลไว้ใน group
          const g = groupStore.get(jobGroupId);
          if (g) {
            g.results.push({
              place,
              lang,
              sources: counts,
              total: capped.length,
              items: capped
            });
          }
        } catch (err) {
          const g = groupStore.get(jobGroupId);
          if (g) g.errors.push({ placeId: place.placeId, error: String(err?.message || err) });
        }
      }, { priority: 1 });
    }));

    // เมื่อคิวว่าง (idle) ให้สรุปผลและ callback (ถ้ามี)
    (async () => {
      await queue.onIdle();
      const g = groupStore.get(jobGroupId);
      if (!g) return;
      g.status = 'done';

      const payload = {
        ok: true,
        jobGroupId,
        lang,
        results: g.results,
        errors: g.errors
      };

      if (g.callbackUrl) {
        try {
          const body = JSON.stringify(payload);
          const headers = { 'content-type': 'application/json' };
          if (SCRAPE_SECRET) headers['x-signature'] = hmac(body);
          await fetch(g.callbackUrl, { method: 'POST', headers, body });
        } catch (e) {
          // เก็บ error ไว้เฉยๆ
          g.errors.push({ callbackUrl: g.callbackUrl, error: String(e?.message || e) });
        }
      }
    })();

    res.json({ ok: true, jobGroupId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ===================================================================
// 3) POLL: GET /scrape/status/:jobGroupId
// ===================================================================
app.get('/scrape/status/:jobGroupId', verifyHmac, (req, res) => {
  const { jobGroupId } = req.params || {};
  const g = groupStore.get(jobGroupId);
  if (!g) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({
    ok: true,
    jobGroupId,
    status: g.status,
    results: g.status === 'done' ? g.results : undefined,
    errors: g.errors
  });
});

// ---------- start ----------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('review-scraper up on :' + port));
