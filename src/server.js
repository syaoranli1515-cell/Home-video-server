const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const db = require('./db/database');
const MediaScanner = require('./utils/scanner');

const app = express();
const PORT = process.env.PORT || 3000;

// Config file path
const configPath = path.join(__dirname, '../config/settings.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/thumbnails', express.static(path.join(__dirname, '../public/thumbnails')));

// Helper to load config
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
  return null;
}

// Helper to save config
function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Check if setup is complete
app.get('/api/setup-status', (req, res) => {
  const config = loadConfig();
  const isSetup = !!(config && config.ffmpegPath && config.mediaPath);
  res.json({ isSetup, config });
});

// Save FFmpeg path
app.post('/api/setup/ffmpeg', (req, res) => {
  const { ffmpegPath } = req.body;
  
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    return res.status(400).json({ error: 'Invalid FFmpeg path' });
  }

  // Verify it's actually ffmpeg
  const { execSync } = require('child_process');
  try {
    execSync(`"${ffmpegPath}" -version`, { stdio: 'pipe' });
  } catch (err) {
    return res.status(400).json({ error: 'Not a valid FFmpeg executable' });
  }

  const config = loadConfig() || {};
  config.ffmpegPath = ffmpegPath;
  saveConfig(config);
  
  res.json({ success: true, message: 'FFmpeg path saved' });
});

// Save media path and trigger scan
app.post('/api/setup/media', async (req, res) => {
  const { mediaPath } = req.body;
  
  if (!mediaPath || !fs.existsSync(mediaPath)) {
    return res.status(400).json({ error: 'Invalid media directory path' });
  }

  const config = loadConfig() || {};
  config.mediaPath = mediaPath;
  saveConfig(config);

  // Start scanning in background
  const scanner = new MediaScanner(mediaPath, config.ffmpegPath);
  
  try {
    const results = await scanner.scanAndStore();
    res.json({ 
      success: true, 
      message: 'Media directory saved and scanned',
      results 
    });
  } catch (err) {
    res.status(500).json({ error: 'Scan failed', details: err.message });
  }
});

// Get all folders
app.get('/api/folders', (req, res) => {
  const folders = db.prepare('SELECT DISTINCT folder_name FROM videos ORDER BY folder_name').all();
  res.json(folders.map(f => f.folder_name));
});

// Get videos by folder
app.get('/api/videos', (req, res) => {
  const { folder } = req.query;
  
  let query;
  if (folder && folder !== 'All') {
    query = db.prepare('SELECT * FROM videos WHERE folder_name = ? ORDER BY filename');
    var videos = query.all(folder);
  } else {
    query = db.prepare('SELECT * FROM videos ORDER BY folder_name, filename');
    videos = query.all();
  }
  
  res.json(videos);
});

// Stream video
app.get('/api/video/:id', (req, res) => {
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
  
  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }

  if (!fs.existsSync(video.file_path)) {
    return res.status(404).json({ error: 'Video file not found' });
  }

  const stat = fs.statSync(video.file_path);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(video.file_path, { start, end });
    
    const headers = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    };
    
    res.writeHead(206, headers);
    file.pipe(res);
  } else {
    const headers = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4'
    };
    
    res.writeHead(200, headers);
    fs.createReadStream(video.file_path).pipe(res);
  }
});

// Trigger rescan
app.post('/api/rescan', async (req, res) => {
  const config = loadConfig();
  
  if (!config || !config.mediaPath) {
    return res.status(400).json({ error: 'Media path not configured' });
  }

  const scanner = new MediaScanner(config.mediaPath, config.ffmpegPath);
  
  try {
    const results = await scanner.scanAndStore();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: 'Rescan failed', details: err.message });
  }
});

// Serve main page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Accessible from any device on your local network');
});
