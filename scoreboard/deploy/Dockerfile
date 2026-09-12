FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js scoring.js ./
COPY public ./public

EXPOSE 4100
CMD ["node", "server.js"]
