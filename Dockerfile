FROM mcr.microsoft.com/playwright:v1.55.0-jammy
WORKDIR /app
COPY package.json package-lock.json* ./
# ตัวเลือก: ข้ามดาวน์โหลด browser ซ้ำ เพราะ image นี้มีให้แล้ว
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
