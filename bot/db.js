const Database = require("better-sqlite3");
const db = new Database("./data/database.db");

db.exec(`
CREATE TABLE IF NOT EXISTS tracked (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    steamInput TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS guild_config (
    guildId TEXT PRIMARY KEY,
    channelId TEXT
);
`);

module.exports = db;