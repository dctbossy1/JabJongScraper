import { chromium } from 'playwright';

export async function withBrowser(fn) {
  const browser = await chromium.launch({
    args: ['--no-sandbox'],
    headless: true,
  });
  try {
    const context = await browser.newContext({
      userAgent: process.env.SCRAPER_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      locale: 'th-TH',
    });
    const page = await context.newPage();
    if (process.env.SCRAPER_PROXY) {
      // ถ้าต้องใช้ proxy ให้ตั้งที่ระดับ Playwright runtime หรือใช้ lib เสริม (ขอข้ามในเทมเพลต)
    }
    const out = await fn(page);
    await context.close();
    return out;
  } finally {
    await browser.close();
  }
}

export async function tinyDelay(min = 800, max = 1600) {
  const t = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, t));
}
