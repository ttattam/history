#!/bin/bash

# Stop script for Claude Code History System

set -e

echo "🛑 Stopping Claude Code History System..."

# Stop Docker services
echo "🐳 Stopping Docker services..."
docker-compose down

echo "✅ All services stopped successfully!"
echo ""
echo "💾 Data is preserved in Docker volumes:"
echo "   - postgres_data"  
echo "   - chromadb_data"
echo "   - redis_data"
echo ""
echo "🗑️  To completely remove all data:"
echo "   docker-compose down -v"