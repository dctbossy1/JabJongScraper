import { withBrowser, tinyDelay } from '../utils/browser.js';
import { normalizeReview } from '../utils/normalize.js';

async function gotoSearch(page, q) {
  const url = `https://www.tiktok.com/search/video?q=${encodeURIComponent(q)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // กดปุ่มยอมรับคุกกี้ถ้ามี
  try {
    await page.waitForSelector('[data-e2e="cookie-banner-accept-button"]', { timeout: 3000 });
    await page.click('[data-e2e="cookie-banner-accept-button"]');
    await tinyDelay(400, 800);
  } catch {}
}

async function readSIGI(page) {
  return await page.evaluate(() => {
    const el = document.querySelector('script#SIGI_STATE');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch { return null; }
  });
}

async function collectVideoLinks(page, max = 30) {
  const links = new Set();
  for (let i = 0; i < 5; i++) {
    const found = await page.$$eval('a[href*="/video/"]', as => as.map(a => a.href));
    found.forEach(h => links.add(h));
    if (links.size >= max) break;
    await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
    await tinyDelay(500, 900);
  }
  return Array.from(links).slice(0, max);
}

async function extractVideosFromSearch(page, placeName) {
  const out = [];
  const data = await readSIGI(page);

  if (data?.ItemModule && typeof data.ItemModule === 'object') {
    for (const [vid, v] of Object.entries(data.ItemModule)) {
      const caption = (v?.desc || '').trim();
      out.push({
        url: `https://www.tiktok.com/@${v?.author}/video/${vid}`,
        caption,
        author: v?.author || '',
        createTime: v?.createTime ? new Date(Number(v.createTime) * 1000).toISOString() : null
      });
    }
  }

  // fallback ถ้า SIGI ว่าง
  if (out.length === 0) {
    const links = await collectVideoLinks(page, 20);
    for (const url of links) {
      out.push({ url, caption: '', author: '', createTime: null });
    }
  }

  return out.slice(0, 10).map(x => normalizeReview({
    source: 'tiktok',
    sourceUrl: x.url,
    placeName,
    author: x.author,
    rating: null,
    text: x.caption,
    lang: null,
    publishedAt: x.createTime
  }));
}

export async function scrapeTikTok({ queries = [], placeName = '' }) {
  const safeQueries = queries
    .map(q => String(q).replace(/"+/g, '').trim())
    .filter(Boolean);

  const out = [];
  await withBrowser(async (page) => {
    // ปรับ User-Agent และ header
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    for (const q of safeQueries.slice(0, 5)) {
      try {
        await gotoSearch(page, q);
        await tinyDelay(1200, 1800);
        const items = await extractVideosFromSearch(page, placeName);
        out.push(...items);
        if (out.length >= 10) break;
      } catch (e) {
        // ลองคำถัดไป
      }
    }
  });
  return out;
}
