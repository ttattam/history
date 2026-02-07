#!/bin/bash

# Test script for Claude Code History System
# Performs basic functionality tests

set -e

echo "🧪 Testing Claude Code History System..."

# Check if services are running
echo "🔍 Checking service health..."

# Test PostgreSQL
if ! docker-compose exec -T postgres pg_isready -U postgres -d claude_history > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not ready"
    exit 1
fi
echo "✅ PostgreSQL is healthy"

# Test ChromaDB
if ! curl -s http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
    echo "❌ ChromaDB is not responding"
    exit 1
fi
echo "✅ ChromaDB is healthy"

# Test Redis
if ! docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "❌ Redis is not responding"
    exit 1
fi
echo "✅ Redis is healthy"

# Test API (if backend is running)
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "✅ Backend API is responding"
    
    # Test database connection through API
    if curl -s http://localhost:8080/health/database | grep -q "healthy"; then
        echo "✅ API database connection is working"
    else
        echo "⚠️  API database connection has issues"
    fi
    
    # Test ChromaDB connection through API
    if curl -s http://localhost:8080/health/chromadb | grep -q "healthy"; then
        echo "✅ API ChromaDB connection is working"
    else
        echo "⚠️  API ChromaDB connection has issues"
    fi
else
    echo "⚠️  Backend API is not running (start with: cd backend && uvicorn app.main:app --reload --port 8080)"
fi

# Test Frontend (if running)
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Frontend is responding"
else
    echo "⚠️  Frontend is not running (start with: cd frontend && npm start)"
fi

echo ""
echo "🎉 Basic health checks completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Start backend: cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8080"
echo "   2. Start frontend: cd frontend && npm start"
echo "   3. Open http://localhost:3000 in your browser"
echo "   4. Import your first conversation using the Import page"