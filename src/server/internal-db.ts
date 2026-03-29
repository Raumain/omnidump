import "@tanstack/react-start/server-only";
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
