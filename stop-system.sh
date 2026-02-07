#!/bin/bash

echo "🛑 Stopping Claude Code History System..."

# Stop processes using PIDs
if [ -f "logs/auto-import.pid" ]; then
    AUTO_IMPORT_PID=$(cat logs/auto-import.pid)
    if ps -p $AUTO_IMPORT_PID > /dev/null; then
        kill $AUTO_IMPORT_PID
        echo "✅ Stopped auto-importer (PID: $AUTO_IMPORT_PID)"
    fi
    rm logs/auto-import.pid
fi

if [ -f "logs/api-server.pid" ]; then
    API_SERVER_PID=$(cat logs/api-server.pid)
    if ps -p $API_SERVER_PID > /dev/null; then
        kill $API_SERVER_PID
        echo "✅ Stopped API server (PID: $API_SERVER_PID)"
    fi
    rm logs/api-server.pid
fi

# Kill any remaining processes
pkill -f "auto-import-claude.js" 2>/dev/null && echo "✅ Cleaned up auto-import processes"
pkill -f "api/server.js" 2>/dev/null && echo "✅ Cleaned up API server processes"

echo ""
echo "✅ Claude Code History System stopped successfully!"
echo ""
echo "📊 Database preserved: history.db"
echo "📝 Logs preserved in logs/ directory"
echo ""
echo "🚀 To restart: ./start-system.sh"