import { withBrowser, tinyDelay } from '../utils/browser.js';
import { normalizeReview } from '../utils/normalize.js';

async function extractVideos(page, placeName) {
  // พยายามอ่าน SIGI_STATE ที่ฝังในหน้า
  const data = await page.evaluate(() => {
    try {
      const s = window['SIGI_STATE'];
      // โครงอาจเปลี่ยนได้ ให้ fallback DOM ถ้าไม่เจอ
      return s || null;
    } catch { return null; }
  });

  const out = [];
  if (data && data.ItemModule) {
    for (const [vid, v] of Object.entries(data.ItemModule)) {
      // กรอง caption ที่เกี่ยวกับสถานที่ (แบบหลวม ๆ)
      const caption = (v?.desc || '').trim();
      out.push({
        url: `https://www.tiktok.com/@${v?.author}/video/${vid}`,
        caption,
        author: v?.author || '',
        createTime: v?.createTime ? new Date(Number(v.createTime) * 1000).toISOString() : null
      });
    }
  } else {
    // fallback: เก็บลิงก์จาก <a> ที่ชี้ไป video
    const links = await page.$$eval('a', as => as.map(a => a.href).filter(h => /\/video\/\d+/.test(h)));
    for (const url of Array.from(new Set(links)).slice(0, 10)) {
      out.push({ url, caption: '', author: '', createTime: null });
    }
  }

  // แปลงเป็น normalized “review-like” (ถือเป็น UGC อ้างอิง)
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
  // queries: เช่น ["\"Longhua\" รีวิว", "\"Longhua\" review", ...]
  const out = [];
  await withBrowser(async (page) => {
    for (const q of queries.slice(0, 2)) {
      const url = `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await tinyDelay(1500, 2500);
        const items = await extractVideos(page, placeName);
        out.push(...items);
        if (out.length >= 10) break;
      } catch (e) {}
    }
  });
  return out;
}
