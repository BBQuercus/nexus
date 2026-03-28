FROM node:22-alpine AS base

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci
# Install platform-specific optional deps missing from macOS-generated lockfile
RUN npm install --no-save @parcel/watcher-linux-x64-musl @next/swc-linux-x64-musl 2>/dev/null || true

# Copy source and build
COPY . .
RUN mkdir -p public && npm run build

# Production image
FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
