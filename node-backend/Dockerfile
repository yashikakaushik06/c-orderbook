# Dockerfile — C++ engine + Node.js server
# Multi-stage: Stage 1 compiles C++ addon, Stage 2 is minimal runtime

# ── Stage 1: Build C++ addon ──────────────────────────────────────────────
FROM node:20-bookworm AS builder

RUN apt-get update && apt-get install -y \
    build-essential cmake python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy C++ headers and binding source
COPY cpp-engine/include ./cpp-engine/include
COPY node-backend/bindings ./node-backend/bindings
COPY node-backend/binding.gyp ./node-backend/
COPY node-backend/package*.json ./node-backend/

WORKDIR /app/node-backend
RUN npm ci
RUN npm run build:addon

# ── Stage 2: Runtime ──────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y libstdc++6 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node-backend/node_modules ./node_modules
COPY --from=builder /app/node-backend/build        ./build
COPY node-backend/src    ./src
COPY node-backend/package.json .

ENV NODE_ENV=production
ENV PORT=3001
ENV ENGINE_THREADS=8

EXPOSE 3001

CMD ["node", "src/server.js"]
