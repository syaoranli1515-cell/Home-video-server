const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../config/media.db');
const db = new Database(dbPath);

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    folder_name TEXT NOT NULL,
    duration REAL,
    thumbnail_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_folder ON videos(folder_name);
  CREATE INDEX IF NOT EXISTS idx_filename ON videos(filename);
`);

module.exports = db;
