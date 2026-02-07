#!/bin/bash

echo "🚀 Setting up Claude Code History System..."

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun not found. Install it first:"
    echo "curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Initialize database
echo "🗄️ Creating database..."
bun run database/init.js

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "⚙️ Creating .env file..."
    cat > .env << EOF
# Claude Code History Configuration
PORT=3000
DB_PATH=./history.db
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info

# Optional: OpenAI API for semantic search (Phase 2)
# OPENAI_API_KEY=your_key_here

# Optional: Embedding model settings
EMBEDDING_MODEL=local
# EMBEDDING_MODEL=openai  # for OpenAI API
# EMBEDDING_MODEL=ollama   # for local Ollama
EOF
    echo "✅ .env file created"
fi

# Create data directories
mkdir -p data/exports data/backups

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Quick start:"
echo "1. Import some conversations: bun run scripts/import-claude.js path/to/export.json"
echo "2. Start the server: bun run api/server.js" 
echo "3. Open http://localhost:3000"
echo ""
echo "📚 Files created:"
echo "  - history.db (SQLite database)"
echo "  - .env (configuration)"
echo "  - data/ (exports and backups)"
echo ""
echo "Happy searching! 🔍"