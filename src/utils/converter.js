const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { getDatabase, saveDatabase } = require('../db/database');

class VideoConverter {
  constructor(ffmpegPath) {
    this.ffmpegPath = ffmpegPath;
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath);
    }
    this.outputDir = path.join(__dirname, '../../public/converted');
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  getQualitySettings(quality) {
    const settings = {
      '720p': { width: 1280, height: 720, videoBitrate: '2M', audioBitrate: '128k' },
      '1080p': { width: 1920, height: 1080, videoBitrate: '4M', audioBitrate: '192k' },
      '2k': { width: 2560, height: 1440, videoBitrate: '8M', audioBitrate: '256k' }
    };
    return settings[quality] || settings['720p'];
  }

  async convertVideo(videoId, quality, onProgress) {
    const db = await getDatabase();
    
    // Get original video info
    const result = db.exec('SELECT * FROM videos WHERE id = ?', [videoId]);
    if (result.length === 0 || result[0].values.length === 0) {
      throw new Error('Video not found');
    }

    const columns = result[0].columns;
    const row = result[0].values[0];
    const video = {};
    columns.forEach((col, i) => {
      video[col] = row[i];
    });

    // Check if conversion already exists
    const existingConversion = db.exec(
      'SELECT * FROM conversions WHERE original_video_id = ? AND quality = ?',
      [videoId, quality]
    );

    if (existingConversion && existingConversion.length > 0 && existingConversion[0].values.length > 0) {
      const convColumns = existingConversion[0].columns;
      const convRow = existingConversion[0].values[0];
      const existing = {};
      convColumns.forEach((col, i) => {
        existing[col] = convRow[i];
      });

      if (existing.status === 'completed') {
        return { conversionId: existing.id, filePath: existing.converted_file_path, status: 'exists' };
      } else if (existing.status === 'processing') {
        return { conversionId: existing.id, status: 'processing' };
      }
    }

    // Create conversion record
    const outputFilename = `${path.basename(video.file_path, path.extname(video.file_path))}_${quality}.mp4`;
    const outputPath = path.join(this.outputDir, outputFilename);

    let conversionId;
    if (existingConversion && existingConversion.length > 0) {
      conversionId = existingConversion[0].values[0][0]; // id is first column
      db.run('UPDATE conversions SET status = ?, progress = ? WHERE id = ?', ['processing', 0, conversionId]);
    } else {
      db.run(`
        INSERT INTO conversions (original_video_id, converted_file_path, quality, status, progress)
        VALUES (?, ?, ?, ?, ?)
      `, [videoId, outputPath, quality, 'processing', 0]);
      
      const lastInsert = db.exec('SELECT last_insert_rowid()');
      conversionId = lastInsert[0].values[0][0];
    }
    saveDatabase();

    const settings = this.getQualitySettings(quality);

    return new Promise((resolve, reject) => {
      let duration = 0;
      
      // First get duration
      ffmpeg.ffprobe(video.file_path, (err, metadata) => {
        if (!err && metadata && metadata.format && metadata.format.duration) {
          duration = metadata.format.duration;
        }

        ffmpeg(video.file_path)
          .setFfmpegPath(this.ffmpegPath)
          .outputOptions([
            `-vf scale=${settings.width}:${settings.height}`,
            `-b:v ${settings.videoBitrate}`,
            `-b:a ${settings.audioBitrate}`,
            '-c:v libx264',
            '-preset medium',
            '-crf 23',
            '-c:a aac',
            '-movflags +faststart'
          ])
          .output(outputPath)
          .on('progress', (progress) => {
            const percent = duration > 0 ? Math.round((progress.percent || 0)) : 0;
            db.run('UPDATE conversions SET progress = ? WHERE id = ?', [percent, conversionId]);
            saveDatabase();
            
            if (onProgress) {
              onProgress(percent);
            }
          })
          .on('end', () => {
            db.run(`
              UPDATE conversions 
              SET status = 'completed', progress = 100, completed_at = CURRENT_TIMESTAMP 
              WHERE id = ?
            `, [conversionId]);
            saveDatabase();
            
            resolve({ conversionId, filePath: outputPath, status: 'completed' });
          })
          .on('error', (err) => {
            db.run('UPDATE conversions SET status = ?, progress = ? WHERE id = ?', ['failed', 0, conversionId]);
            saveDatabase();
            
            reject(err);
          })
          .run();
      });
    });
  }

  async getConversionsForVideo(videoId) {
    const db = await getDatabase();
    const result = db.exec('SELECT * FROM conversions WHERE original_video_id = ?', [videoId]);
    
    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    return result[0].values.map(row => {
      const conversion = {};
      columns.forEach((col, i) => {
        conversion[col] = row[i];
      });
      return conversion;
    });
  }

  async getBestPlayablePath(video) {
    // If original is mp4, use it
    if (path.extname(video.file_path).toLowerCase() === '.mp4') {
      return { path: video.file_path, type: 'original', converted: false };
    }

    // Look for completed conversions
    const conversions = await this.getConversionsForVideo(video.id);
    const completed = conversions.filter(c => c.status === 'completed');
    
    if (completed.length > 0) {
      // Prefer highest quality
      const qualityOrder = ['2k', '1080p', '720p'];
      for (const q of qualityOrder) {
        const conv = completed.find(c => c.quality === q);
        if (conv && fs.existsSync(conv.converted_file_path)) {
          return { path: conv.converted_file_path, type: conv.quality, converted: true, conversionId: conv.id };
        }
      }
      
      // Return any completed conversion
      const anyCompleted = completed[0];
      if (fs.existsSync(anyCompleted.converted_file_path)) {
        return { path: anyCompleted.converted_file_path, type: anyCompleted.quality, converted: true, conversionId: anyCompleted.id };
      }
    }

    // No playable version available
    return { path: null, type: null, converted: false, needsConversion: true };
  }

  async deleteConversion(conversionId) {
    const db = await getDatabase();
    const result = db.exec('SELECT converted_file_path FROM conversions WHERE id = ?', [conversionId]);
    
    if (result.length > 0 && result[0].values.length > 0) {
      const filePath = result[0].values[0][0];
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      db.run('DELETE FROM conversions WHERE id = ?', [conversionId]);
      saveDatabase();
    }
  }
}

module.exports = VideoConverter;
