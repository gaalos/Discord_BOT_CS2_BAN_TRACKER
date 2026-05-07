const Database = require("better-sqlite3");
const db = new Database("./data/database.db");

// création table si inexistante
db.exec(`
CREATE TABLE IF NOT EXISTS tracked (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    steamInput TEXT UNIQUE
);
`);

// 🔥 MIGRATION SAFE
try {
    db.prepare(`SELECT isBanned FROM tracked LIMIT 1`).get();
} catch {
    console.log("🧱 Adding missing column isBanned");

    db.exec(`
        ALTER TABLE tracked ADD COLUMN isBanned INTEGER DEFAULT 0;
    `);
}

db.exec(`
CREATE TABLE IF NOT EXISTS guild_config (
    guildId TEXT PRIMARY KEY,
    channelId TEXT
);
`);

module.exports = db;