const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

let db = null;

async function getDatabase() {
  if (db) return db;
  
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '../../config/media.db');
  
  // Ensure config directory exists
  const configDir = path.dirname(dbPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  // Load existing database or create new one
  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(dbPath);
  } catch (err) {
    // File doesn't exist, will create new
    fileBuffer = null;
  }
  
  if (fileBuffer) {
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  
  // Initialize database tables
  db.run(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,
      filename TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      duration REAL,
      thumbnail_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_folder ON videos(folder_name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_filename ON videos(filename)`);
  
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    const dbPath = path.join(__dirname, '../../config/media.db');
    fs.writeFileSync(dbPath, buffer);
  }
}

module.exports = { getDatabase, saveDatabase };
