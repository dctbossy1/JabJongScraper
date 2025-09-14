FROM node:20-bullseye

WORKDIR /app
COPY package*.json ./
RUN npm ci
# ลง Chromium และ dependencies
RUN npx playwright install --with-deps chromium

COPY . .
EXPOSE 3333
CMD ["node", "server.js"]
