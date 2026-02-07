#!/bin/bash

# Start script for Claude Code History System
# Starts all services in development mode

set -e

echo "🚀 Starting Claude Code History System..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please run ./scripts/setup.sh first."
    exit 1
fi

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d

# Wait for services
echo "⏳ Waiting for services to be ready..."
sleep 5

# Health check
echo "🏥 Running health checks..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
        echo "✅ ChromaDB is ready"
        break
    fi
    
    attempt=$((attempt + 1))
    if [ $attempt -eq $max_attempts ]; then
        echo "❌ ChromaDB failed to start"
        exit 1
    fi
    
    sleep 1
done

# Check PostgreSQL
if docker-compose exec -T postgres pg_isready -U postgres -d claude_history > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready"
else
    echo "❌ PostgreSQL is not ready"
    exit 1
fi

echo "✅ All services are ready!"
echo ""
echo "🌐 Available services:"
echo "   - PostgreSQL: localhost:5432"
echo "   - ChromaDB: http://localhost:8000"
echo "   - Redis: localhost:6379"
echo ""
echo "🚀 To start the application servers:"
echo "   Backend (Terminal 1): cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8080"
echo "   Frontend (Terminal 2): cd frontend && npm start"
echo ""
echo "📊 Monitor services:"
echo "   docker-compose logs -f"