// server.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { scrapeTikTok } from "./scrapers/tiktok.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// เสิร์ฟหน้าและไฟล์สาธารณะ
app.use("/pages", express.static(path.join(__dirname, "pages")));

// หน้า default -> ฟอร์ม
app.get("/", (_req, res) => {
  res.redirect("/pages/jab-jong-form.html");
});

// API ยิงสแครป
app.post("/api/scrape/tiktok", async (req, res) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];

    const results = [];
    for (const job of payload) {
      const place = job.place || {};
      const queries = job?.queries?.tiktok || [];
      const perSource = Number(job?.limits?.perSource || 6);

      const items = await scrapeTikTok({ place, queries, limit: perSource });

      results.push({
        ok: true,
        source: "tiktok",
        place: { placeId: place.placeId || "", name: place.name || "" },
        items,
        count: items.length,
        userId: job.userId || null,
        cuisine: job.cuisine || null,
        lang: job.lang || "th",
      });
    }

    res.json(Array.isArray(req.body) ? results : results[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
