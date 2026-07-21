// db/client.ts
import { DatabaseSync } from "node:sqlite";

export const db = new DatabaseSync("app.db");

// Heartbeats table
db.exec(`
CREATE TABLE IF NOT EXISTS heartbeats (
    server_id TEXT PRIMARY KEY,
    player_count INTEGER NOT NULL,
    last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// Historical snapshots of total players and active servers
db.exec(`
CREATE TABLE IF NOT EXISTS heartbeat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_players INTEGER NOT NULL,
    active_servers INTEGER NOT NULL
);
`);

// Server counters table
db.exec(`
CREATE TABLE IF NOT EXISTS server_counters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// Map completion times
db.exec(`
CREATE TABLE IF NOT EXISTS map_times (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    map_id TEXT NOT NULL,
    time_ms INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// Custom blocks table
db.exec(`
CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    name TEXT NOT NULL,
    instructions TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// Custom maps table
db.exec(`
CREATE TABLE IF NOT EXISTS maps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT "",
    gold_time TEXT NOT NULL,
    silver_time TEXT NOT NULL,
    bronze_time TEXT NOT NULL,
    map_data TEXT NOT NULL,
    block_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// --- Auto-Migration Check for Existing app.db ---
try {
    db.exec(`ALTER TABLE maps ADD COLUMN block_count INTEGER DEFAULT 0;`);
} catch {
    // Ignored if column already exists
}

// Table to log page views
db.exec(`
CREATE TABLE IF NOT EXISTS map_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER NOT NULL,
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// Table to log map loads/plays
db.exec(`
CREATE TABLE IF NOT EXISTS map_loads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER NOT NULL,
    loaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// Hourly snapshots of each map's total views and loads
db.exec(`
CREATE TABLE IF NOT EXISTS map_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id INTEGER NOT NULL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_views INTEGER NOT NULL,
    total_loads INTEGER NOT NULL
);
`);
