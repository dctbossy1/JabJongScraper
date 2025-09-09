import { withBrowser, tinyDelay } from '../utils/browser.js';
import { normalizeReview } from '../utils/normalize.js';

export async function scrapeFacebook({ urls = [], placeName = '' }) {
  // urls: ใส่ลิงก์เพจ เช่น https://www.facebook.com/SomeRestaurant
  const targets = urls.slice(0, 3).map(u => 
    u.replace('www.facebook.com', 'm.facebook.com').replace(/\/$/, '')
  );
  const out = [];
  await withBrowser(async (page) => {
    for (const base of targets) {
      const reviewUrl = `${base}/reviews/`;
      try {
        await page.goto(reviewUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await tinyDelay();
        // ดึงการ์ดรีวิวที่มองเห็นได้ (มักอยู่ใน div[role=article] บน m.)
        const cards = await page.$$('[role="article"]');
        for (const c of cards) {
          const text = (await c.textContent() || '').trim();
          if (text && text.length > 30) {
            out.push(normalizeReview({
              source: 'facebook',
              sourceUrl: reviewUrl,
              placeName,
              author: '',   // ถ้าต้องการ author: หา locator ของชื่อคนโพสต์เพิ่มได้
              rating: null, // FB review เป็น recommendation yes/no มากกว่า
              text,
              lang: 'th',
              publishedAt: null
            }));
          }
        }
        // fallback: ลอง /about
        if (out.length === 0) {
          const aboutUrl = `${base}/about/`;
          await page.goto(aboutUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await tinyDelay();
          const body = await page.content();
          const m = body.match(/(\+66|0)\d[\d\s\-]{7,12}/);
          if (m) {
            out.push(normalizeReview({
              source: 'facebook',
              sourceUrl: aboutUrl,
              placeName,
              author: '',
              rating: null,
              text: `Phone: ${m[0].replace(/\s+/g,'')}`,
              lang: null,
              publishedAt: null
            }));
          }
        }
      } catch (e) {}
    }
  });
  return out;
}
