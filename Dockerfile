FROM node:20-slim AS base
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev
RUN npx prisma generate

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm install
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["npm", "run", "start"]
