# Dockerfile  ─  Node.js bridge + C++ engine (multi-stage)
# Deploy to Railway: railway up

# ── Stage 1: Build C++ engine ─────────────────────────────────────────────────
FROM ubuntu:24.04 AS cpp-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git pkg-config \
    libwebsockets-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY cpp-engine/ ./cpp-engine/

RUN cmake -B cpp-engine/build \
          -S cpp-engine \
          -DCMAKE_BUILD_TYPE=Release \
          -DCMAKE_CXX_FLAGS="-O3 -march=x86-64-v3" \
    && cmake --build cpp-engine/build -j$(nproc)

# ── Stage 2: Node.js runtime ──────────────────────────────────────────────────
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebsockets19 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy C++ binary
COPY --from=cpp-builder /src/cpp-engine/build/algo_engine ./bin/algo_engine
RUN chmod +x ./bin/algo_engine

# Copy Node.js backend
COPY node-backend/package*.json ./
RUN npm ci --omit=dev

COPY node-backend/src/ ./src/
COPY node-backend/.env.example ./.env.example

# ── Startup script ────────────────────────────────────────────────────────────
# Launches C++ engine in background, then starts Node.js bridge
RUN cat > /app/start.sh << 'EOF'
#!/bin/sh
set -e

SYMBOLS=${SYMBOLS:-"BTC,ETH,SOL"}
THREADS=${THREADS:-"8"}
CPP_SOCKET_PATH=${CPP_SOCKET_PATH:-"/tmp/algo_engine.sock"}

echo "[start.sh] Launching C++ engine (symbols=$SYMBOLS threads=$THREADS)"
/app/bin/algo_engine --symbols "$SYMBOLS" --threads "$THREADS" &
CPP_PID=$!

# Wait for socket to appear (max 10s)
i=0
while [ ! -S "$CPP_SOCKET_PATH" ] && [ $i -lt 100 ]; do
  sleep 0.1
  i=$((i+1))
done

if [ ! -S "$CPP_SOCKET_PATH" ]; then
  echo "[start.sh] ERROR: C++ engine socket not found at $CPP_SOCKET_PATH"
  exit 1
fi

echo "[start.sh] C++ engine ready. Starting Node.js bridge..."
node src/server.js &
NODE_PID=$!

# Forward signals
trap "kill $CPP_PID $NODE_PID 2>/dev/null; exit 0" INT TERM

wait $NODE_PID
EOF
RUN chmod +x /app/start.sh

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>r.ok?process.exit(0):process.exit(1))"

CMD ["/app/start.sh"]
