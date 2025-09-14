// scrapers/browserPool.js
import { chromium } from "playwright";

let _browser = null;

/**
 * ใช้ Browser ตัวเดียวตลอดโปรเซส เพื่อลด resource และไม่โดน pthread_create error
 * - บน Railway ใช้ --disable-dev-shm-usage เพราะปรับ --shm-size ไม่ได้
 * - ถ้า _browser หลุด/ตาย จะเปิดใหม่ให้อัตโนมัติ
 */
export async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;

  _browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",        // สำคัญสำหรับ Railway
      "--disable-gpu",
      "--disable-extensions",
      "--disable-renderer-backgrounding",
      "--renderer-process-limit=1",
      "--no-zygote",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  _browser.on("disconnected", () => {
    _browser = null; // ให้สร้างใหม่รอบหน้า
  });

  return _browser;
}

/**
 * เปิด context/page ใหม่ต่อหนึ่งงาน (อย่าลืมปิดด้วย safeClose)
 */
export async function newPage({ locale = "th-TH" } = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    locale,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  return { context, page };
}

/**
 * ปิด context ให้เรียบร้อย ป้องกันรั่ว
 */
export async function safeClose(context) {
  try {
    await context?.close();
  } catch {
    // เงียบไว้
  }
}
