// scrapers/tiktok.js
import { newPage, safeClose } from './browserPool.js';
import { runInQueue } from './queue.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function autoScroll(page, { step = 800, totalSteps = 10, delay = 400 } = {}) {
  for (let i = 0; i < totalSteps; i++) {
    await page.mouse.wheel(0, step);
    await sleep(delay);
  }
}

export async function scrapeTikTok({ place = {}, queries = [], limit = 6 }) {
  if (!Array.isArray(queries) || queries.length === 0) return [];
  const base = 'https://www.tiktok.com/search?q=';
  const collected = new Map();

  // รันทั้งงานในคิวเดียว (จำกัด concurrency ระดับ process)
  return runInQueue(async () => {
    const { context, page } = await newPage();
    try {
      for (const q of queries) {
        if (collected.size >= limit) break;

        const url = `${base}${encodeURIComponent(q)}&t=${Date.now()}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

        // ยอมรับคุกกี้ถ้ามี
        try {
          const btn = page.locator('button:has-text("Accept all"), button:has-text("ยอมรับทั้งหมด")');
          if (await btn.count()) await btn.first().click({ timeout: 3000 }).catch(() => {});
        } catch {}

        await page.waitForTimeout(1200);
        await autoScroll(page, { totalSteps: 8, delay: 350 });

        const cards = await page.locator('a[href*="/video/"]').elementHandles();
        for (const h of cards) {
          if (collected.size >= limit) break;
          const href = await h.getAttribute('href');
          if (!href) continue;

          const root = await h.evaluateHandle((a) => a.closest('[data-e2e], article, div'));
          let caption = '', author = '', likeTxt = '';

          if (root) {
            caption = (await root.evaluate(el => {
              const c = el.querySelector('[data-e2e="video-desc"], [data-e2e*="desc"], p, span');
              return c ? c.textContent : '';
            })) || '';

            author = (await root.evaluate(el => {
              const c = el.querySelector('[data-e2e="video-author-name"], [data-e2e*="author"], a[href*="@"]')
                       || el.querySelector('span[class*="author"]');
              return c ? c.textContent : '';
            })) || '';

            likeTxt = (await root.evaluate(el => {
              const c = el.querySelector('[data-e2e="like-count"], [data-e2e*="like"], [title*="like"]')
                       || el.querySelector('strong, span[title]');
              return c ? c.textContent : '';
            })) || '';
          }

          const absolute = href.startsWith('http') ? href : `https://www.tiktok.com${href}`;
          if (!collected.has(absolute)) {
            collected.set(absolute, {
              source: 'tiktok',
              sourceUrl: absolute,
              placeName: place?.name || '',
              placeId: place?.placeId || '',
              text: String(caption || '').replace(/\s+/g, ' ').trim(),
              author: String(author || '').replace(/\s+/g, ' ').trim(),
              likeText: String(likeTxt || '').replace(/\s+/g, ' ').trim(),
            });
          }
        }
      }

      return Array.from(collected.values()).slice(0, limit);
    } finally {
      await safeClose(context);
    }
  });
}
