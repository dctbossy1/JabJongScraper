# ---- Base
FROM node:20-bullseye

# ใช้ path กลางเก็บเบราว์เซอร์ ไม่ผูกกับ HOME ของ user
ENV TZ=Asia/Bangkok \
    NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# ฟอนต์ภาษาไทย/จีน/อีโมจิ + ของจำเป็น
RUN apt-get update && apt-get install -y --no-install-recommends \
      fonts-noto \
      fonts-noto-cjk \
      fonts-noto-color-emoji \
      fonts-thai-tlwg \
      ca-certificates \
      curl \
    && rm -rf /var/lib/apt/lists/*

# ติดตั้ง deps ของแอป (โหมดโปรดักชัน)
COPY package*.json ./
RUN npm ci --omit=dev

# ติดตั้ง Chromium + system deps ให้เรียบร้อย (ตอนยังเป็น root)
RUN npx playwright install --with-deps chromium

# ให้สิทธิ์ user node
RUN mkdir -p /ms-playwright && chown -R node:node /app /ms-playwright

# คัดลอกซอร์ส
COPY . .

# รันด้วย user ปลอดภัย
USER node

# Railway จะตั้ง PORT ให้อัตโนมัติ (server.js ต้องใช้ process.env.PORT)
EXPOSE 3333

# ปรับ concurrency ได้ผ่าน ENV
ENV SCRAPE_CONCURRENCY=2

# (ไม่จำเป็นต้องมี --shm-size บน Railway)
CMD ["node", "server.js"]
