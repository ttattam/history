#!/bin/bash

echo "🚀 Starting Claude Code History Memory System..."

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

# Check if database exists
if [ ! -f "history.db" ]; then
    echo "🗄️ Initializing database..."
    node database/init.js
fi

# Kill existing processes
echo "🧹 Cleaning up existing processes..."
pkill -f "auto-import-claude.js" 2>/dev/null || true
pkill -f "api/server.js" 2>/dev/null || true

# Start universal auto-import watcher in background
echo "👀 Starting universal conversation auto-importer..."
nohup node scripts/universal-claude-importer.js --watch > logs/auto-import.log 2>&1 &
AUTO_IMPORT_PID=$!

# Start API server in background
echo "🌐 Starting API server..."
nohup env PORT=3001 node api/server.js > logs/api-server.log 2>&1 &
API_SERVER_PID=$!

# Wait for services to start
sleep 3

# Check if services are running
if ps -p $AUTO_IMPORT_PID > /dev/null; then
    echo "✅ Auto-importer running (PID: $AUTO_IMPORT_PID)"
else
    echo "❌ Failed to start auto-importer"
fi

if ps -p $API_SERVER_PID > /dev/null; then
    echo "✅ API server running (PID: $API_SERVER_PID)"
else
    echo "❌ Failed to start API server"
fi

# Save PIDs for stopping later
mkdir -p logs
echo $AUTO_IMPORT_PID > logs/auto-import.pid
echo $API_SERVER_PID > logs/api-server.pid

echo ""
echo "🎉 Claude Code History System is running!"
echo ""
echo "📊 Web Interface: http://localhost:3001"
echo "🕸️ Graph View: http://localhost:3001/graph.html"
echo "📡 API Health: http://localhost:3001/health"
echo ""
echo "📝 Logs:"
echo "   Auto-import: tail -f logs/auto-import.log"
echo "   API Server: tail -f logs/api-server.log"
echo ""
echo "🛑 To stop: ./stop-system.sh"
echo ""
echo "💡 The system will automatically detect and import new Claude Code conversations!"

# Test the system
echo "🧪 Running system test..."
sleep 2

HEALTH=$(curl -s http://localhost:3001/health 2>/dev/null | grep -o '"status":"ok"' || echo "")
if [ -n "$HEALTH" ]; then
    echo "✅ System health check passed"
    
    # Get stats
    STATS=$(curl -s http://localhost:3001/stats 2>/dev/null || echo "{}")
    echo "📈 Current stats: $STATS"
    
else
    echo "⚠️ System health check failed - please check logs"
fi

echo ""
echo "🚀 Ready to use! Open http://localhost:3001 in your browser."