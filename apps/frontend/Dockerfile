# Multi-stage build for frontend
# Usage: docker build --build-arg BACKEND_URL=https://ai-interviewer-ky0h.onrender.com -t ai-interviewer-frontend .

# ===== Build stage =====
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy root package.json and lockfile
COPY package.json package.json
COPY bun.lock bun.lock
COPY turbo.json turbo.json

# Install root workspace dependencies
RUN bun install --frozen-lockfile

# Copy frontend package.json and install frontend-specific deps
COPY apps/frontend/package.json apps/frontend/package.json
WORKDIR /app/apps/frontend
RUN bun install --frozen-lockfile

WORKDIR /app

# Copy frontend source
COPY apps/frontend/ apps/frontend/
COPY apps/frontend/src/ apps/frontend/src/

# Build frontend with backend URL injected at build time
ARG BACKEND_URL=https://ai-interviewer-ky0h.onrender.com
ENV BACKEND_URL=${BACKEND_URL}

WORKDIR /app/apps/frontend
RUN bun run build.ts --outdir=dist

# ===== Production stage =====
FROM oven/bun:1-slim

WORKDIR /app

# Copy built frontend files from builder
COPY --from=builder /app/apps/frontend/dist /app/apps/frontend/dist
COPY --from=builder /app/apps/frontend/src/index.html /app/apps/frontend/src/index.html

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "src/index.ts"]
