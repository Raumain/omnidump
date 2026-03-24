import { Database } from "bun:sqlite";

export const db = new Database("omnidump.db");

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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);