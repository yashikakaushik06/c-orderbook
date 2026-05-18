# Algo Dashboard — Full Stack Trading System

```
C++ Analytics Engine → Node.js Bridge → React Dashboard
         ↑                   ↑                ↑
   Low-latency           Socket.IO        Chart.js
   indicators         REST + WebSocket   Real-time UI
   Ring buffer        Binance feed       Vercel Edge
   Thread pool        Railway deploy
```

## Architecture

```
Binance WebSocket
       │
       ▼
  PriceFeed (Node.js)
       │  ingestTick()
       ▼
  C++ AnalyticsEngine          ← compiled via N-API (node-gyp)
  ├── RingBuffer<PriceTick, 4096>   (lock-free SPSC)
  ├── ThreadPool (8 threads)
  ├── IndicatorEngine (per symbol)
  │   ├── RSI (Wilder, O(1))
  │   ├── MACD (12,26,9 EMA, O(1))
  │   ├── Bollinger Bands (20-period)
  │   ├── VWAP (session)
  │   └── EMA (9, 20, 50, 200)
  ├── StrategyEngine (per symbol)
  │   ├── MACD crossover
  │   ├── RSI extremes
  │   ├── EMA golden/death cross
  │   └── Bollinger squeeze breakout
  └── LatencyTracker (histogram, p99/p99.9)
       │
       ▼
  onSnapshot / onSignal / onMetrics (ThreadSafeFunction → V8)
       │
       ▼
  Socket.IO Server (Node.js)
       │  WebSocket
       ▼
  React Dashboard
  ├── useEngine() hook (Socket.IO client)
  ├── PriceChart (Chart.js, animation: false)
  ├── IndicatorPanel
  ├── SignalFeed
  └── SystemMetrics
```

## Project Layout

```
algo-dashboard/
├── cpp-engine/
│   ├── include/
│   │   ├── ring_buffer.h       Lock-free SPSC ring buffer
│   │   ├── types.h             PriceTick, IndicatorSnapshot, TradingSignal
│   │   ├── indicators.h        RSI, MACD, BB, EMA, VWAP engines
│   │   ├── strategy.h          Rule-based signal generator
│   │   ├── thread_pool.h       Task-stealing thread pool
│   │   └── latency_tracker.h   Histogram + p99/p99.9
│   ├── src/
│   │   ├── engine.cpp          AnalyticsEngine coordinator
│   │   └── bench.cpp           Standalone benchmark binary
│   └── CMakeLists.txt
│
├── node-backend/
│   ├── bindings/
│   │   └── engine_binding.cpp  N-API binding (ThreadSafeFunction)
│   ├── src/
│   │   ├── server.js           Express + Socket.IO server
│   │   ├── priceFeed.js        Binance WebSocket ingestor
│   │   └── mockEngine.js       Pure-JS mock for dev (no C++ needed)
│   ├── binding.gyp             node-gyp build config
│   ├── package.json
│   ├── Dockerfile              Multi-stage: C++ build + Node runtime
│   └── railway.toml
│
└── react-frontend/
    ├── src/
    │   ├── hooks/
    │   │   └── useEngine.js    Socket.IO + rolling price history
    │   ├── components/
    │   │   ├── PriceChart.jsx  Chart.js real-time line chart
    │   │   ├── IndicatorPanel.jsx
    │   │   ├── SignalFeed.jsx
    │   │   └── SystemMetrics.jsx
    │   ├── App.jsx             Main dashboard layout
    │   └── index.js
    ├── package.json
    └── vercel.json
```

## Local Development (mock engine — no C++ needed)

```bash
# Backend (uses JS mock engine automatically)
cd node-backend
npm install
npm run dev          # nodemon — hot reload

# Frontend (separate terminal)
cd react-frontend
npm install
npm start            # CRA dev server on :3000 (proxy → :3001)
```

## Build the C++ Addon

Requires: `node-gyp`, `python3`, `g++` (or `clang++`)

```bash
cd node-backend
npm install
npm run build:addon
# Binary: build/Release/algo_engine.node
node src/server.js   # now loads native engine
```

## Run the C++ Benchmark

```bash
cd cpp-engine
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
./engine_bench
# Expected: ~800k–1.5M ticks/sec, avg latency < 1ms
```

## Deploy

### Backend → Railway

1. Push `node-backend/` to a Git repo
2. Connect to Railway → New Project → GitHub repo
3. Set env vars:
   ```
   PORT=3001
   ENGINE_THREADS=8
   FRONTEND_URL=https://your-app.vercel.app
   ```
4. Railway will run the `Dockerfile` (multi-stage C++ build)

### Frontend → Vercel

1. Push `react-frontend/` to a Git repo
2. Import to Vercel → Framework: Create React App
3. Set env var:
   ```
   REACT_APP_BACKEND_URL=https://your-backend.up.railway.app
   ```
4. Deploy — auto-deployed on every push

## Performance Characteristics

| Metric              | Value                  |
|---------------------|------------------------|
| Tick throughput     | ~1M ticks/sec          |
| Indicator latency   | < 1ms (avg)            |
| P99 latency         | < 3ms                  |
| Ring buffer size    | 4096 ticks/symbol      |
| Thread pool         | 8 threads (configurable)|
| Price history (UI)  | 120 data points        |
| WebSocket protocol  | Socket.IO v4           |

## Adding a New Strategy

Edit `cpp-engine/include/strategy.h` → `StrategyEngine::evaluate()`:

```cpp

```

## Adding a New Indicator

Edit `cpp-engine/include/indicators.h` → `IndicatorEngine::compute()`, then expose the new field in `types.h → IndicatorSnapshot`.

## Environment Variables

| Variable              | Default               | Description                  |
|-----------------------|-----------------------|------------------------------|
| `PORT`                | `3001`                | Node.js server port          |
| `ENGINE_THREADS`      | `8`                   | C++ thread pool size         |
| `FRONTEND_URL`        | `*`                   | CORS allowed origin          |
| `REACT_APP_BACKEND_URL` | `http://localhost:3001` | Backend WebSocket URL     |
