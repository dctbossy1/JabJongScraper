# ---- Base
FROM node:20-bullseye

# เวลา + locale เผื่อ log/เวลานัดหมาย
ENV TZ=Asia/Bangkok \
    NODE_ENV=production

# โฟลเดอร์แอป
WORKDIR /app

# ติดตั้งฟอนต์และของจำเป็น (ให้เรนเดอร์ TH/CJK/Emoji สวย ๆ)
RUN apt-get update && apt-get install -y --no-install-recommends \
      fonts-noto \
      fonts-noto-cjk \
      fonts-noto-color-emoji \
      fonts-thai-tlwg \
      ca-certificates \
      curl \
    && rm -rf /var/lib/apt/lists/*

# ติดตั้ง deps ของแอป (production only)
COPY package*.json ./
RUN npm ci --omit=dev

# ติดตั้ง Chromium + system deps ของ Playwright
RUN npx playwright install --with-deps chromium

# คัดลอกซอร์สโค้ด
COPY . .

# (ถ้าใช้ PM2 ก็ใส่ global ตรงนี้ได้ แต่ปัจจุบันไม่จำเป็น)

# เปลี่ยนสิทธิ์เป็น user 'node' (ปลอดภัยกว่า root)
RUN chown -R node:node /app
USER node

# พอร์ต API
EXPOSE 3333

# Healthcheck (จะสำเร็จเมื่อหน้า /pages/ โหลดได้)
# ถ้าในแอปมี /health ก็เปลี่ยนเป็น /health ได้เลย
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3333/pages/jab-jong-form.html').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

# ค่า concurrency (ปรับได้ตอน runtime)
ENV SCRAPE_CONCURRENCY=2

# สตาร์ตเซิร์ฟเวอร์
CMD ["node", "server.js"]
