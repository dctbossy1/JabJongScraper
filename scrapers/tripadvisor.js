import * as cheerio from 'cheerio';
import { getText } from '../utils/http.js';
import { normalizeReview } from '../utils/normalize.js';

function pickJSON(html) {
  // จับ JSON block ที่มักใส่ data
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

export async function scrapeTripAdvisor({ urls = [], placeName = '' }) {
  const out = [];
  for (const url of urls.slice(0, 5)) {
    try {
      const html = await getText(url);
      const ld = pickJSON(html);
      // LD บางครั้งจะมี "review" เป็น array
      const reviews = Array.isArray(ld?.review) ? ld.review : [];
      for (const r of reviews) {
        out.push(normalizeReview({
          source: 'tripadvisor',
          sourceUrl: url,
          placeName: placeName || ld?.name || '',
          author: r?.author?.name || r?.author || '',
          rating: r?.reviewRating?.ratingValue ? Number(r.reviewRating.ratingValue) : null,
          text: r?.reviewBody || r?.description || '',
          lang: 'en', // TripAdvisor บางเคสปนภาษา ตรวจเพิ่มได้
          publishedAt: r?.datePublished || null
        }));
      }
      // fallback: ดึง snippet ที่อยู่ใน DOM
      if (out.length === 0) {
        const $ = cheerio.load(html);
        $('[data-test-target="review-text"]').each((_, el) => {
          const text = $(el).text().trim();
          if (text) out.push(normalizeReview({
            source: 'tripadvisor',
            sourceUrl: url,
            placeName,
            author: '',
            rating: null,
            text,
            lang: null,
            publishedAt: null
          }));
        });
      }
    } catch (e) {}
  }
  return out;
}
