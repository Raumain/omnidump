import "@tanstack/react-start/server-only";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";

// 1. Database path resolution safely reading from environment or fallback
const dbPath = process.env.DATABASE_URL || "./data/omnidump.sqlite";
const dbDir = path.dirname(dbPath);

// 2. Safely create the data directory before resolving SQLite connection
if (!fs.existsSync(dbDir)) {
	fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// 3. Keep existing table definitions
db.run("PRAGMA journal_mode = WAL;");

db.run(`
  CREATE TABLE IF NOT EXISTS saved_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    driver TEXT,
    host TEXT,
    port INTEGER,
    user TEXT,
    password TEXT,
    database_name TEXT,
    use_ssh INTEGER DEFAULT 0,
    ssh_host TEXT,
    ssh_port INTEGER,
    ssh_user TEXT,
    ssh_private_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const existingColumns = db
	.query("PRAGMA table_info(saved_connections)")
	.all() as Array<{ name: string }>;

const existingColumnSet = new Set(existingColumns.map((column) => column.name));

if (!existingColumnSet.has("use_ssh")) {
	db.run("ALTER TABLE saved_connections ADD COLUMN use_ssh INTEGER DEFAULT 0");
}

if (!existingColumnSet.has("ssh_host")) {
	db.run("ALTER TABLE saved_connections ADD COLUMN ssh_host TEXT");
}

if (!existingColumnSet.has("ssh_port")) {
	db.run("ALTER TABLE saved_connections ADD COLUMN ssh_port INTEGER");
}

if (!existingColumnSet.has("ssh_user")) {
	db.run("ALTER TABLE saved_connections ADD COLUMN ssh_user TEXT");
}

if (!existingColumnSet.has("ssh_private_key")) {
	db.run("ALTER TABLE saved_connections ADD COLUMN ssh_private_key TEXT");
}

// Anonymization profiles table - stores named profiles per connection
db.run(`
  CREATE TABLE IF NOT EXISTS anonymization_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (connection_id) REFERENCES saved_connections(id) ON DELETE CASCADE
  )
`);

// Anonymization rules table - stores per-column anonymization settings
db.run(`
  CREATE TABLE IF NOT EXISTS anonymization_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL,
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    method TEXT NOT NULL,
    options TEXT,
    FOREIGN KEY (profile_id) REFERENCES anonymization_profiles(id) ON DELETE CASCADE
  )
`);
