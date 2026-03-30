FROM node:22-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY drizzle ./drizzle

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "--dns-result-order=ipv4first", "dist/index.js"]
