import { request } from 'undici';

export async function getText(url, headers = {}) {
  const res = await request(url, {
    method: 'GET',
    headers: {
      'User-Agent': process.env.SCRAPER_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept-Language': 'th,en-US;q=0.9',
      ...headers,
    },
  });
  if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode} for ${url}`);
  return await res.body.text();
}
