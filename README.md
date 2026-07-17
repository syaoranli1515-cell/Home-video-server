# 🎬 Home Video Server

A simple, self-hosted video media server optimized for mobile and Android TV devices.

## Features

- **One-click installation** with batch script
- **Responsive design** - works on mobile, tablet, desktop, and Android TV
- **TV-friendly navigation** - large cards, visible focus states, remote control support
- **Automatic thumbnail generation** using FFmpeg
- **Folder-based organization** with "All" view
- **Range-based video streaming** for smooth playback
- **Automatic library refresh** on startup (cleans up missing files)

## Quick Start

### Windows

1. **Download FFmpeg** (if not already installed):
   - Visit https://ffmpeg.org/download.html
   - Download and extract to a folder (e.g., `C:\ffmpeg`)
   - Note the path to `ffmpeg.exe` (e.g., `C:\ffmpeg\bin\ffmpeg.exe`)

2. **Install & Run**:
   ```
   Double-click install.bat
   ```
   
   This will:
   - Install all Node.js dependencies
   - Start the server automatically

3. **Access the server**:
   - On the same machine: http://localhost:3000
   - From other devices: http://YOUR_IP:3000

### First Run Setup

On first access, you'll be guided through:
1. **FFmpeg Path** - Enter the path to ffmpeg executable
2. **Media Directory** - Select your video folder
3. **Scan** - Automatically scans and generates thumbnails

## Supported Video Formats

- MP4, MKV, AVI, MOV, WMV, FLV, WebM

## Project Structure

```
home-video-server/
├── bin/                    # (Optional) Place ffmpeg.exe here
├── config/                 # Database and settings
│   ├── media.db           # SQLite database
│   └── settings.json      # Configuration file
├── public/
│   ├── css/               # Stylesheets
│   ├── js/                # Client-side scripts
│   ├── thumbnails/        # Generated thumbnails
│   └── index.html         # Main UI
├── src/
│   ├── db/
│   │   └── database.js    # Database setup
│   ├── routes/            # API routes
│   ├── utils/
│   │   └── scanner.js     # Media scanner
│   └── server.js          # Main server
├── install.bat            # One-click installer
├── start.bat              # Start server
└── package.json           # Dependencies
```

## Network Access

To access from other devices on your network:

1. Find your local IP address:
   - Windows: Run `ipconfig` in Command Prompt
   - Look for "IPv4 Address" (e.g., 192.168.1.100)

2. Share this URL with other devices:
   ```
   http://192.168.1.100:3000
   ```

## Android TV Optimization

- Large, focusable cards (48px minimum touch targets)
- High contrast focus rings (yellow)
- Top navigation bar (safe for overscan)
- Keyboard/remote navigation support
- Escape key closes player

## Customization

### Change Port

Edit `src/server.js` and change:
```javascript
const PORT = process.env.PORT || 3000; // Change 3000 to your desired port
```

### Add More Video Formats

Edit `src/utils/scanner.js` and add extensions to:
```javascript
this.videoExtensions = ['.mp4', '.mkv', '.avi', ...];
```

## Troubleshooting

### FFmpeg not found
- Ensure ffmpeg.exe path is correct
- Try running: `"C:\path\to\ffmpeg.exe" -version`

### Can't access from other devices
- Check firewall settings - allow port 3000
- Ensure devices are on the same network
- Verify your IP address hasn't changed

### Thumbnails not generating
- Check FFmpeg path is valid
- Ensure public/thumbnails folder has write permissions

## Technologies Used

- **Backend**: Node.js, Express
- **Database**: SQLite (better-sqlite3)
- **Video Processing**: FFmpeg, fluent-ffmpeg
- **Frontend**: Vanilla JS, CSS Grid
- **Video Player**: Video.js
- **Icons**: Heroicons (inline SVG)

## License

MIT License - Feel free to use and modify!
