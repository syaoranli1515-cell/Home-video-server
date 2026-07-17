const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { getDatabase, saveDatabase } = require('../db/database');

class MediaScanner {
  constructor(mediaPath, ffmpegPath) {
    this.mediaPath = mediaPath;
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath);
    }
    this.videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
  }

  async scanDirectory(dir, folderName = '') {
    const videos = [];
    
    if (!fs.existsSync(dir)) {
      return videos;
    }

    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        const subFolderName = folderName ? `${folderName}/${item.name}` : item.name;
        videos.push(...await this.scanDirectory(fullPath, subFolderName));
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
    const db = await getDatabase();
    const videos = await this.scanDirectory(this.mediaPath);
    console.log(`Found ${videos.length} video files`);

    const results = {
      total: videos.length,
      processed: 0,
      failed: 0,
      folders: new Set()
    };

    // Clean up old entries not in current scan
    const currentPaths = videos.map(v => v.filePath);
    
    // Delete videos that no longer exist
    try {
      const existingVideos = db.exec('SELECT file_path, thumbnail_path FROM videos');
      for (const row of existingVideos) {
        const filePath = row[0];
        const thumbPath = row[1];
        if (!currentPaths.includes(filePath)) {
          db.run('DELETE FROM videos WHERE file_path = ?', [filePath]);
          // Also delete thumbnail if exists
          if (thumbPath && fs.existsSync(path.join(__dirname, '../../public', thumbPath))) {
            fs.unlinkSync(path.join(__dirname, '../../public', thumbPath));
          }
        }
      }
      saveDatabase();
    } catch (err) {
      console.error('Error cleaning up old entries:', err);
    }

    // Process each video
    for (const video of videos) {
      try {
        results.folders.add(video.folderName);
        
        // Check if video already exists
        const existing = db.exec('SELECT * FROM videos WHERE file_path = ?', [video.filePath]);
        
        if (existing && existing.length > 0) {
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
        const hasThumbnail = fs.existsSync(thumbnailPath);
        db.run(`
          INSERT OR REPLACE INTO videos (file_path, filename, folder_name, duration, thumbnail_path, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [video.filePath, video.filename, video.folderName, duration, 
          hasThumbnail ? `/thumbnails/${thumbnailFilename}` : null]);

        results.processed++;
        console.log(`Processed: ${video.filename}`);
      } catch (err) {
        results.failed++;
        console.error(`Error processing ${video.filename}:`, err.message);
      }
    }

    saveDatabase();
    console.log('Scan complete!');
    return {
      ...results,
      folders: Array.from(results.folders)
    };
  }
}

module.exports = MediaScanner;
