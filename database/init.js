#!/usr/bin/env node

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'history.db');
const schemaPath = join(__dirname, 'schema.sql');

console.log('🚀 Initializing Claude Code History Database...');

try {
    // Create or connect to database
    const db = new Database(dbPath);
    
    // Read schema
    const schema = readFileSync(schemaPath, 'utf8');
    
    // Execute schema
    db.exec(schema);
    
    // Test the setup
    const testQuery = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    `);
    
    const tables = testQuery.all();
    
    console.log('✅ Database initialized successfully!');
    console.log('📊 Created tables:', tables.map(t => t.name).join(', '));
    console.log('📍 Database location:', dbPath);
    
    // Test FTS5
    const ftsTest = db.prepare("SELECT * FROM messages_fts LIMIT 1");
    ftsTest.all();
    console.log('✅ FTS5 search ready');
    
    db.close();
    
} catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    process.exit(1);
}

console.log('\n🎯 Next steps:');
console.log('1. Run: bun run scripts/import-claude.js <path-to-json>');
console.log('2. Start API: bun run api/server.js');
console.log('3. Open: http://localhost:3000');