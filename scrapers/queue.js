// scrapers/queue.js
const MAX_CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY || 2);
let active = 0;
const q = [];

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
    const res = await job.fn();
    job.resolve(res);
  } catch (e) {
    job.reject(e);
  } finally {
    active--;
    drain();
  }
}
