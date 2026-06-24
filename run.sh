#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Detect Bun ─────────────────────────────────────────────────
BUN_CMD=""
for candidate in bun "$HOME/.bun/bin/bun" "$HOME/.local/bin/bun" "/usr/local/bin/bun"; do
    if [ -x "$candidate" ]; then
        BUN_CMD="$candidate"
        break
    fi
done

if [ -z "$BUN_CMD" ]; then
    echo "❌ Bun not found. Install it: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

echo "========================================="
echo "  AI Interviewer — Starting Servers"
echo "========================================="

# ── Kill existing processes on ports ─────────────────────────
kill_port() {
    local port=$1
    local pid
    pid=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo "      Killing process on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null || true
        sleep 1
    fi
}

echo ""
echo "[0/4] Checking for existing processes..."
kill_port 3000
kill_port 3001

# ── Backend ──────────────────────────────────────────────────
echo ""
echo "[1/4] Starting backend on http://localhost:3001 ..."
cd "$PROJECT_DIR/apps/backend"

# Load .env if it exists
if [ -f ".env" ]; then
    set -a; source .env; set +a
fi

# Start backend (background)
$BUN_CMD run index.ts &
BACKEND_PID=$!
echo "      Backend PID: $BACKEND_PID"

# ── Frontend ─────────────────────────────────────────────────
echo ""
echo "[2/4] Starting frontend on http://localhost:3000 ..."
cd "$PROJECT_DIR/apps/frontend"

# Install deps if node_modules missing
if [ ! -d "node_modules" ]; then
    echo "      Installing frontend dependencies..."
    $BUN_CMD install
fi

# Load .env if it exists
if [ -f ".env" ]; then
    set -a; source .env; set +a
fi

# Start frontend dev server directly (background)
# Using direct command instead of 'bun run dev' to avoid PATH issues with subshells
$BUN_CMD --hot src/index.ts &
FRONTEND_PID=$!
echo "      Frontend PID: $FRONTEND_PID"

# ── Wait for servers ─────────────────────────────────────────
echo ""
echo "[3/4] Waiting for servers to be ready..."

# Wait for backend
for i in $(seq 1 30); do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1/pre-interview -X POST -H "Content-Type: application/json" -d '{"github":"test"}' 2>/dev/null | grep -q "200"; then
        echo "      ✅ Backend is ready!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "      ❌ Backend failed to start. Check logs above."
        kill $BACKEND_PID 2>/dev/null
        exit 1
    fi
    sleep 1
done

# Wait for frontend
for i in $(seq 1 30); do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
        echo "      ✅ Frontend is ready!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "      ❌ Frontend failed to start. Check logs above."
        kill $BACKEND_PID 2>/dev/null
        exit 1
    fi
    sleep 1
done

echo ""
echo "========================================="
echo "  ✅ AI Interviewer is running!"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:3001"
echo "========================================="

# ── Open in browser ──────────────────────────────────────────
echo ""
echo "Opening browser..."
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3000" &
elif command -v open &> /dev/null; then
    open "http://localhost:3000" &
elif command -v google-chrome &> /dev/null; then
    google-chrome "http://localhost:3000" &
elif command -v chromium-browser &> /dev/null; then
    chromium-browser "http://localhost:3000" &
else
    echo "      Could not auto-open browser. Visit http://localhost:3000 manually."
fi

# ── Keep running & cleanup on Ctrl+C ─────────────────────────
echo ""
echo "Press Ctrl+C to stop all servers..."
trap "echo ''; echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
