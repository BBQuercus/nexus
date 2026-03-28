FROM node:22-alpine AS base

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --include=optional

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
