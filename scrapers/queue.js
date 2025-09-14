// scrapers/queue.js

// ปรับจำนวนงานขนานได้ด้วย ENV, ดีฟอลต์ = 2
const MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.SCRAPE_CONCURRENCY || 2)
);

// (ออปชัน) ตั้ง timeout ต่อ job กันแฮงค์
const JOB_TIMEOUT_MS = Number(process.env.SCRAPE_JOB_TIMEOUT_MS || 90_000);

let active = 0;
const q = [];

/**
 * ครอบฟังก์ชันงานให้วิ่งในคิว จำกัด concurrency
 */
export function runInQueue(fn) {
  return new Promise((resolve, reject) => {
    q.push({ fn, resolve, reject });
    drain();
  });
}

async function drain() {
  if (active >= MAX_CONCURRENCY) return;
  const job = q.shift();
  if (!job) return;

  active++;
  try {
    const p = job.fn();
    const res = await withTimeout(p, JOB_TIMEOUT_MS);
    job.resolve(res);
  } catch (e) {
    job.reject(e);
  } finally {
    active--;
    // ไล่ต่อให้ครบคิว
    setImmediate(drain);
  }
}

function withTimeout(promise, ms) {
  if (!ms || ms <= 0) return promise;
  let to;
  const timeout = new Promise((_, rej) => {
    to = setTimeout(() => rej(new Error(`job timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(to)), timeout]);
}
