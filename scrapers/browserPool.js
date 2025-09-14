// scrapers/browserPool.js
import { chromium } from 'playwright';

let _browser = null;
export async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',          // ถ้า RAM พอ แนะนำเอาบรรทัดนี้ออก + ให้ /dev/shm ใหญ่ขึ้นแทน
      '--disable-gpu',
      '--disable-extensions',
      '--disable-renderer-backgrounding',
      '--renderer-process-limit=1',       // จำกัด renderer processes
      '--no-zygote',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  return _browser;
}

export async function newPage({ locale = 'th-TH' } = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    locale,
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  return { context, page };
}

export async function safeClose(context) {
  try { await context?.close(); } catch {}
}
