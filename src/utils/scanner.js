const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const db = require('../db/database');

class MediaScanner {
  constructor(mediaPath, ffmpegPath) {
    this.mediaPath = mediaPath;
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath);
    }
    this.videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
  }

  scanDirectory(dir, folderName = '') {
    const videos = [];
    
    if (!fs.existsSync(dir)) {
      return videos;
    }

    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        const subFolderName = folderName ? `${folderName}/${item.name}` : item.name;
        videos.push(...this.scanDirectory(fullPath, subFolderName));
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (this.videoExtensions.includes(ext)) {
          videos.push({
            filePath: fullPath,
            filename: item.name,
            folderName: folderName || 'Root'
          });
        }
      }
    }

    return videos;
  }

  async getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration || 0);
      });
    });
  }

  async generateThumbnail(videoPath, thumbnailPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['10%'],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: '320x180'
        })
        .on('end', () => resolve(thumbnailPath))
        .on('error', (err) => reject(err));
    });
  }

  async scanAndStore() {
    console.log('Starting media scan...');
    const videos = this.scanDirectory(this.mediaPath);
    console.log(`Found ${videos.length} video files`);

    const results = {
      total: videos.length,
      processed: 0,
      failed: 0,
      folders: new Set()
    };

    // Clean up old entries not in current scan
    const currentPaths = videos.map(v => v.filePath);
    const stmt = db.prepare('DELETE FROM videos WHERE file_path NOT IN (?)');
    
    // Delete videos that no longer exist
    db.exec('BEGIN TRANSACTION');
    try {
      const existingVideos = db.prepare('SELECT file_path FROM videos').all();
      for (const video of existingVideos) {
        if (!currentPaths.includes(video.file_path)) {
          db.prepare('DELETE FROM videos WHERE file_path = ?').run(video.file_path);
          // Also delete thumbnail if exists
          const thumb = db.prepare('SELECT thumbnail_path FROM videos WHERE file_path = ?').get(video.file_path);
          if (thumb && thumb.thumbnail_path && fs.existsSync(thumb.thumbnail_path)) {
            fs.unlinkSync(thumb.thumbnail_path);
          }
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      console.error('Error cleaning up old entries:', err);
    }

    // Process each video
    for (const video of videos) {
      try {
        results.folders.add(video.folderName);
        
        // Check if video already exists
        const existing = db.prepare('SELECT * FROM videos WHERE file_path = ?').get(video.filePath);
        
        if (existing) {
          results.processed++;
          continue;
        }

        // Get duration
        let duration = 0;
        try {
          duration = await this.getVideoDuration(video.filePath);
        } catch (err) {
          console.warn(`Could not get duration for ${video.filename}:`, err.message);
        }

        // Generate thumbnail
        const thumbnailFilename = `${path.basename(video.filePath, path.extname(video.filePath))}.jpg`;
        const thumbnailPath = path.join(__dirname, '../../public/thumbnails', thumbnailFilename);
        
        try {
          await this.generateThumbnail(video.filePath, thumbnailPath);
        } catch (err) {
          console.warn(`Could not generate thumbnail for ${video.filename}:`, err.message);
        }

        // Insert into database
        db.prepare(`
          INSERT OR REPLACE INTO videos (file_path, filename, folder_name, duration, thumbnail_path, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(video.filePath, video.filename, video.folderName, duration, 
          fs.existsSync(thumbnailPath) ? `/thumbnails/${thumbnailFilename}` : null);

        results.processed++;
        console.log(`Processed: ${video.filename}`);
      } catch (err) {
        results.failed++;
        console.error(`Error processing ${video.filename}:`, err.message);
      }
    }

    console.log('Scan complete!');
    return {
      ...results,
      folders: Array.from(results.folders)
    };
  }
}

module.exports = MediaScanner;
