export function normalizeReview({
  source,          // 'wongnai' | 'tripadvisor' | 'facebook' | 'tiktok'
  sourceUrl,
  placeName,
  author,
  rating,          // number | null (1..5 ถ้ามี)
  text,            // string
  lang,            // 'th' | 'en' | ...
  publishedAt,     // ISO string | null
  extra = {}
}) {
  return {
    source,
    sourceUrl,
    placeName,
    author: author || '',
    rating: typeof rating === 'number' ? rating : null,
    text: (text || '').trim(),
    lang: lang || null,
    publishedAt: publishedAt || null,
    extra
  };
}
