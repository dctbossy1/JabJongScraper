import * as cheerio from 'cheerio';
import { getText } from '../utils/http.js';
import { normalizeReview } from '../utils/normalize.js';

function extractJsonLd(html) {
  const $ = cheerio.load(html);
  const nodes = $('script[type="application/ld+json"]');
  let merged = null;
  nodes.each((_, el) => {
    try {
      const obj = JSON.parse($(el).text() || '{}');
      // บางหน้ามีหลาย block รวมกันแบบง่าย ๆ
      if (Array.isArray(obj)) {
        for (const o of obj) merged = { ...(merged||{}), ...o };
      } else {
        merged = { ...(merged||{}), ...obj };
      }
    } catch {}
  });
  return merged;
}

export async function scrapeWongnai({ urls = [], placeName = '' }) {
  const out = [];
  for (const url of urls.slice(0, 5)) {
    try {
      const html = await getText(url);
      const ld = extractJsonLd(html) || {};
      const reviews = Array.isArray(ld?.review) ? ld.review : [];
      for (const r of reviews) {
        out.push(
          normalizeReview({
            source: 'wongnai',
            sourceUrl: url,
            placeName: placeName || ld?.name || '',
            author: r?.author?.name || r?.author || '',
            rating: r?.reviewRating?.ratingValue ? Number(r.reviewRating.ratingValue) : null,
            text: r?.reviewBody || r?.description || '',
            lang: 'th',
            publishedAt: r?.datePublished || null
          })
        );
      }
      // เผื่อไม่มี review ใน LD ให้ดึงข้อความรีวิวที่โชว์บนหน้า (minimal fallback)
      if (out.length === 0) {
        const $ = cheerio.load(html);
        $('.review-item, .ReviewItem__content').each((_, el) => {
          const text = $(el).text().trim();
          if (text) out.push(normalizeReview({
            source: 'wongnai',
            sourceUrl: url,
            placeName: placeName || ld?.name || '',
            author: '',
            rating: null,
            text,
            lang: 'th',
            publishedAt: null
          }));
        });
      }
    } catch (e) {
      // swallow per-url error
    }
  }
  return out;
}
