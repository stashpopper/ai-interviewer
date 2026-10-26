# ===== Build stage =====
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy root package.json and lockfile first (for dependency resolution)
COPY package.json package.json
COPY bun.lock bun.lock
COPY apps/backend/package.json apps/backend/package.json

# Install all workspace dependencies from root
RUN bun install --frozen-lockfile

# Install backend workspace dependencies
WORKDIR /app/apps/backend
RUN bun install --frozen-lockfile

WORKDIR /app

# Copy all backend source files
COPY apps/backend/ apps/backend/
COPY apps/backend/scrapers/ apps/backend/scrapers/
COPY apps/backend/types.ts apps/backend/types.ts
COPY apps/backend/result.ts apps/backend/result.ts

# ===== Production stage =====
FROM oven/bun:1-slim

WORKDIR /app

# Root workspace install (provides hoisted node_modules with .bun dir)
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/bun.lock /app/bun.lock
RUN bun install --frozen-lockfile

# Backend workspace install (provides express, cors, etc. in backend/node_modules)
COPY --from=builder /app/apps/backend/package.json /app/apps/backend/package.json
WORKDIR /app/apps/backend
RUN bun install --frozen-lockfile

WORKDIR /app

# Copy backend source
COPY --from=builder /app/apps/backend/ apps/backend/
COPY --from=builder /app/apps/backend/scrapers/ apps/backend/scrapers/
COPY --from=builder /app/apps/backend/types.ts apps/backend/types.ts
COPY --from=builder /app/apps/backend/result.ts apps/backend/result.ts
COPY turbo.json turbo.json
COPY apps/backend/index.ts apps/backend/index.ts

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["bun", "apps/backend/index.ts"]
