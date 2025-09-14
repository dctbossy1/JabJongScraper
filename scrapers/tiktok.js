// scrapers/tiktok.js
import { chromium } from 'playwright';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function autoScroll(page, { step = 800, totalSteps = 10, delay = 400 } = {}) {
  for (let i = 0; i < totalSteps; i++) {
    await page.mouse.wheel(0, step);
    await sleep(delay);
  }
}

async function withBrowser(run) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    locale: 'th-TH',
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  try {
    const out = await run({ page, context, browser });
    await context.close(); await browser.close();
    return out;
  } catch (e) {
    await context.close(); await browser.close();
    throw e;
  }
}

/**
 * scrapeTikTok: รับ { place, queries[], limit } => คืน [{source, sourceUrl, placeName, text, author, likeText}]
 */
export async function scrapeTikTok({ place = {}, queries = [], limit = 6 }) {
  if (!Array.isArray(queries) || queries.length === 0) return [];

  const base = 'https://www.tiktok.com/search?q=';
  const collected = new Map();

  await withBrowser(async ({ page }) => {
    for (const q of queries) {
      const url = `${base}${encodeURIComponent(q)}&t=${Date.now()}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

      // กดยอมรับคุกกี้ถ้ามี
      try {
        const btns = page.locator('button:has-text("Accept all"), button:has-text("ยอมรับทั้งหมด")');
        if (await btns.count()) await btns.first().click({ timeout: 3000 }).catch(() => {});
      } catch {}

      await page.waitForTimeout(1200);
      await autoScroll(page, { totalSteps: 10, delay: 400 });

      // เก็บการ์ดวิดีโอบนหน้าค้นหา
      const cards = await page.locator('a[href*="/video/"]').elementHandles();
      for (const h of cards) {
        if (collected.size >= limit) break;
        const href = await h.getAttribute('href');
        if (!href) continue;

        const root = await h.evaluateHandle((a) => a.closest('[data-e2e], article, div'));
        let caption = '', author = '', likeTxt = '';

        if (root) {
          caption =
            (await root.evaluate((el) => {
              const cand = el.querySelector('[data-e2e="video-desc"], [data-e2e*="desc"], p, span');
              return cand ? cand.textContent : '';
            })) || '';
          author =
            (await root.evaluate((el) => {
              const cand =
                el.querySelector('[data-e2e="video-author-name"], [data-e2e*="author"], a[href*="@"]') ||
                el.querySelector('span[class*="author"]');
              return cand ? cand.textContent : '';
            })) || '';
          likeTxt =
            (await root.evaluate((el) => {
              const cand =
                el.querySelector('[data-e2e="like-count"], [data-e2e*="like"], [title*="like"]') ||
                el.querySelector('strong, span[title]');
              return cand ? cand.textContent : '';
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

      if (collected.size >= limit) break;
      await sleep(700 + Math.floor(Math.random() * 600));
    }
  });

  return Array.from(collected.values()).slice(0, limit);
}
