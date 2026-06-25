const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = 3000;

// Setup directories
const musicRoot = path.resolve(__dirname, '../music');
const windowsSyncRoot = path.resolve(__dirname, '../Windows-sync');
const spotifyDownloadDir = path.resolve(musicRoot, 'Spotify Downloads');
if (!fs.existsSync(spotifyDownloadDir)) {
  fs.mkdirSync(spotifyDownloadDir, { recursive: true });
}

// Initialize database
const db = new DatabaseSync(path.join(__dirname, 'lutebox.db'));
db.exec('PRAGMA foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    name TEXT PRIMARY KEY,
    role TEXT,
    color_idx INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS moods (
    name TEXT PRIMARY KEY,
    color TEXT
  );
  
  CREATE TABLE IF NOT EXISTS tags (
    name TEXT PRIMARY KEY
  );
  
  CREATE TABLE IF NOT EXISTS track_tags (
    track_id TEXT,
    tag_name TEXT,
    PRIMARY KEY (track_id, tag_name),
    FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    FOREIGN KEY(tag_name) REFERENCES tags(name) ON DELETE CASCADE
  );
  
  CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    source TEXT,
    rel_path TEXT,
    name TEXT,
    size INTEGER,
    duration REAL,
    hash TEXT,
    mood TEXT,
    char_name TEXT,
    mtime INTEGER,
    FOREIGN KEY(char_name) REFERENCES characters(name) ON DELETE SET NULL,
    FOREIGN KEY(mood) REFERENCES moods(name) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS spotify_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    label TEXT,
    status TEXT DEFAULT 'pending',
    progress TEXT,
    error TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS scan_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL UNIQUE
  );
`);

// Reset interrupted downloads from a previous server run
db.exec("UPDATE spotify_queue SET status='pending', progress=NULL WHERE status='downloading'")

// Seed default scan folders if table is empty
const sfCount = db.prepare('SELECT COUNT(*) as c FROM scan_folders').get();
if (sfCount.c === 0) {
  const insertSF = db.prepare('INSERT OR IGNORE INTO scan_folders (name, path) VALUES (?, ?)');
  insertSF.run('music', musicRoot);
  insertSF.run('Windows-sync', windowsSyncRoot);
}

function getScanFolders() {
  return db.prepare('SELECT * FROM scan_folders ORDER BY id').all();
}
function getAllowedRoots() {
  return getScanFolders().map(f => f.path);
}

// Seed default moods
const defaultMoods = [
  { name: 'Combat / Battle', color: '#c94040' },
  { name: 'Boss Fight', color: '#c9a227' },
  { name: 'Epic / Cinematic', color: '#9b7de0' },
  { name: 'Mystery / Tension', color: '#4a7fc1' },
  { name: 'Stealth / Infiltration', color: '#5a5478' },
  { name: 'Ambient / Explore', color: '#3d9ea8' },
  { name: 'Tavern / Town', color: '#c47830' },
  { name: 'Safe Haven / Rest', color: '#3da85c' },
  { name: 'Spooky / Horror', color: '#1a1228' },
  { name: 'Magical / Feywild', color: '#a878f0' },
  { name: 'Ocean / Sailing', color: '#4a7fc1' },
  { name: 'Chase / Escape', color: '#c94040' }
];

const insertMood = db.prepare('INSERT OR IGNORE INTO moods (name, color) VALUES (?, ?)');
for (const m of defaultMoods) {
  insertMood.run(m.name, m.color);
}

// Seed default tags
const defaultTags = ['Background Audio', 'Soundboard'];
const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
for (const t of defaultTags) {
  insertTag.run(t);
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  if (req.url === '/' || req.url.endsWith('.html') || req.url.endsWith('.js')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.static(__dirname)); // Serve frontend static files

const AUDIO_EXT = new Set(['mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac', 'wma', 'opus', 'webm']);

// Helper: Calculate MD5 hash of a file
function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => reject(err));
  });
}

// Helper: Recursive directory scan
function scanDirRecursive(baseDir, currentDir, filesList) {
  const fullPath = path.join(baseDir, currentDir);
  if (!fs.existsSync(fullPath)) return;
  
  let entries;
  try {
    entries = fs.readdirSync(fullPath, { withFileTypes: true });
  } catch (err) {
    console.error(`Error reading directory ${fullPath}:`, err);
    return;
  }
  
  for (const entry of entries) {
    const relPath = path.join(currentDir, entry.name);
    const absPath = path.join(baseDir, relPath);
    if (entry.isDirectory()) {
      scanDirRecursive(baseDir, relPath, filesList);
    } else if (entry.isFile()) {
      const ext = entry.name.split('.').pop().toLowerCase();
      if (AUDIO_EXT.has(ext)) {
        filesList.push({
          relPath,
          absPath,
          name: entry.name,
          ext
        });
      }
    }
  }
}

// Scan status variables
let scanInProgress = false;
let scanStatusMessage = 'Idle';

async function performScan() {
  if (scanInProgress) return;
  scanInProgress = true;
  scanStatusMessage = 'Scanning directories...';
  
  try {
    const sources = getScanFolders().filter(f => {
      if (!fs.existsSync(f.path)) { console.log(`[scan] skipping missing folder: ${f.path}`); return false; }
      return true;
    });

    const diskFiles = [];
    for (const src of sources) {
      if (fs.existsSync(src.path)) {
        const files = [];
        scanDirRecursive(src.path, '', files);
        for (const f of files) {
          diskFiles.push({
            source: src.name,
            baseDir: src.path,
            ...f
          });
        }
      }
    }
    
    scanStatusMessage = `Hashing files (found ${diskFiles.length} files on disk)...`;
    
    // Load existing database tracks
    const allTracksStmt = db.prepare('SELECT id, size, mtime, hash, duration, mood, char_name FROM tracks');
    const dbTracks = allTracksStmt.all();
    const dbTracksMap = {};
    for (const t of dbTracks) {
      dbTracksMap[t.id] = t;
    }
    
    const missingTracks = { ...dbTracksMap };
    const filesToHash = [];
    
    // Process files on disk
    for (const f of diskFiles) {
      const id = `${f.source}|${f.relPath}`;
      delete missingTracks[id]; // Track is on disk, not missing
      
      let stats;
      try {
        stats = fs.statSync(f.absPath);
      } catch (err) {
        continue;
      }
      
      const size = stats.size;
      const mtime = stats.mtimeMs;
      
      const existing = dbTracksMap[id];
      if (existing && existing.size === size && Math.abs(existing.mtime - mtime) < 1000) {
        // Cache hit: file unchanged
        continue;
      } else {
        filesToHash.push({
          id,
          source: f.source,
          relPath: f.relPath,
          name: f.name,
          absPath: f.absPath,
          size,
          mtime,
          existing
        });
      }
    }
    
    // Hash new/modified files
    let hashedCount = 0;
    for (const f of filesToHash) {
      scanStatusMessage = `Hashing files (${hashedCount + 1}/${filesToHash.length}): ${f.name}`;
      try {
        const hash = await getFileHash(f.absPath);
        
        let mood = f.existing ? f.existing.mood : null;
        let char_name = f.existing ? f.existing.char_name : null;
        let duration = f.existing ? f.existing.duration : null;
        
        if (!mood && !char_name) {
          // Attempt label recovery from missing files with identical hash
          const missingMatchKey = Object.keys(missingTracks).find(k => missingTracks[k].hash === hash);
          if (missingMatchKey) {
            const match = missingTracks[missingMatchKey];
            mood = match.mood;
            char_name = match.char_name;
            duration = match.duration;
            delete missingTracks[missingMatchKey];
          }
        }
        
        const insertStmt = db.prepare(`
          INSERT OR REPLACE INTO tracks (id, source, rel_path, name, size, duration, hash, mood, char_name, mtime)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertStmt.run(f.id, f.source, f.relPath, f.name, f.size, duration, hash, mood, char_name, f.mtime);
      } catch (err) {
        console.error(`Failed to process ${f.absPath}:`, err);
      }
      hashedCount++;
    }
    
    // Delete missing files from DB
    scanStatusMessage = 'Cleaning up removed tracks...';
    const deleteStmt = db.prepare('DELETE FROM tracks WHERE id = ?');
    for (const missingId in missingTracks) {
      deleteStmt.run(missingId);
    }
    
    scanStatusMessage = 'Scan completed successfully';
  } catch (err) {
    console.error('Scan error:', err);
    scanStatusMessage = 'Scan failed: ' + err.message;
  } finally {
    scanInProgress = false;
  }
}

// Helper: Resolve a track ID to absolute path, validated against allowed roots
function resolveTrackPath(trackId) {
  const track = db.prepare('SELECT source, rel_path FROM tracks WHERE id = ?').get(trackId);
  if (!track) return null;

  const folders = getScanFolders();
  const folder = folders.find(f => f.name === track.source);
  if (!folder) return null;

  const resolved = path.resolve(folder.path, track.rel_path);

  // Guard against path traversal
  const roots = getAllowedRoots();
  const safe = roots.some(r => resolved.startsWith(r + path.sep) || resolved === r);
  if (!safe) return null;

  return resolved;
}

// ── SPOTIFY QUEUE SYSTEM ────────────────────────────────────
const { spawn } = require('child_process');
const sseClients = new Set();
let activeDownloadProc = null;
let queueRunning = false;

function broadcastQueue() {
  const items = db.prepare('SELECT * FROM spotify_queue ORDER BY created_at DESC').all();
  const payload = `data: ${JSON.stringify({ type: 'queue', items })}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
}

function queueIsActive() {
  const row = db.prepare("SELECT COUNT(*) as n FROM spotify_queue WHERE status IN ('pending','downloading')").get();
  return row.n > 0;
}

async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (true) {
      const item = db.prepare("SELECT * FROM spotify_queue WHERE status='pending' ORDER BY created_at ASC LIMIT 1").get();
      if (!item) break;

      db.prepare("UPDATE spotify_queue SET status='downloading', updated_at=unixepoch() WHERE id=?").run(item.id);
      broadcastQueue();
      scanStatusMessage = `Downloading: ${item.label || item.url}`;

      await new Promise((resolve) => {
        const isYoutube = /youtube\.com|youtu\.be/i.test(item.url);
        const proc = isYoutube
          ? spawn('yt-dlp', ['-x', '--audio-format', 'mp3', '--audio-quality', '0',
              '--format', 'bestaudio/best',
              '--output', '%(title)s.%(ext)s', '--paths', spotifyDownloadDir, item.url])
          : spawn('python', ['-m', 'spotdl', item.url, '--output', spotifyDownloadDir]);
        activeDownloadProc = proc;

        const onLine = (line) => {
          line = line.trim();
          if (!line) return;
          db.prepare("UPDATE spotify_queue SET progress=?, updated_at=unixepoch() WHERE id=?").run(line, item.id);
          broadcastQueue();
        };

        proc.stdout.on('data', (d) => d.toString().split('\n').forEach(onLine));
        proc.stderr.on('data', (d) => d.toString().split('\n').forEach(onLine));

        proc.on('close', async (code) => {
          activeDownloadProc = null;
          const cur = db.prepare('SELECT status FROM spotify_queue WHERE id=?').get(item.id);
          if (cur && cur.status !== 'cancelled') {
            if (code === 0) {
              db.prepare("UPDATE spotify_queue SET status='completed', progress='Download complete ✓', updated_at=unixepoch() WHERE id=?").run(item.id);
            } else {
              db.prepare("UPDATE spotify_queue SET status='failed', error='Process exited with code ' || ?, updated_at=unixepoch() WHERE id=?").run(String(code), item.id);
            }
          }
          broadcastQueue();
          if (code === 0) {
            scanStatusMessage = 'Spotify download finished. Rescanning library...';
            try { await performScan(); } catch (e) { console.error('Rescan after download failed:', e); }
          }
          resolve();
        });
      });
    }
  } finally {
    queueRunning = false;
    if (!queueIsActive()) scanStatusMessage = 'Ready';
  }
}

// ── FFMPEG GPU ACCELERATION ──────────────────────────────────
// Priority: cuda (NVIDIA) > d3d11va (AMD/Intel/Windows) > videotoolbox (Apple) > vaapi (Linux) > none
let ffmpegHwaccel = [];  // prepended to every ffmpeg -i call

function detectFfmpegHwaccel() {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-hwaccels', '-v', 'quiet']);
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { out += d.toString(); });
    proc.on('close', () => {
      const methods = out.toLowerCase();
      if (methods.includes('cuda'))         { ffmpegHwaccel = ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'];  console.log('[ffmpeg] GPU: CUDA (NVIDIA)'); }
      else if (methods.includes('d3d11va')) { ffmpegHwaccel = ['-hwaccel', 'd3d11va'];                                  console.log('[ffmpeg] GPU: D3D11VA (DirectX)'); }
      else if (methods.includes('videotoolbox')) { ffmpegHwaccel = ['-hwaccel', 'videotoolbox'];                        console.log('[ffmpeg] GPU: VideoToolbox (Apple)'); }
      else if (methods.includes('vaapi'))   { ffmpegHwaccel = ['-hwaccel', 'vaapi'];                                    console.log('[ffmpeg] GPU: VAAPI (Linux)'); }
      else                                  { console.log('[ffmpeg] GPU: none detected, using CPU'); }
      resolve();
    });
    proc.on('error', () => { console.log('[ffmpeg] not found — trim feature unavailable'); resolve(); });
  });
}

// Start processing any queue items that survived a server restart
detectFfmpegHwaccel().then(() => processQueue());

// API: Get status and counts
app.get('/api/status', (req, res) => {
  try {
    const totalStmt = db.prepare('SELECT COUNT(*) as cnt FROM tracks');
    const labeledStmt = db.prepare('SELECT COUNT(*) as cnt FROM tracks WHERE mood IS NOT NULL OR char_name IS NOT NULL');
    const dupesStmt = db.prepare(`
      SELECT COUNT(*) as cnt FROM tracks 
      WHERE hash IN (SELECT hash FROM tracks GROUP BY hash HAVING COUNT(*) > 1)
      AND id != (SELECT MIN(id) FROM tracks t2 WHERE t2.hash = tracks.hash)
    `);
    
    res.json({
      scanning: scanInProgress || queueRunning,
      status: scanStatusMessage,
      counts: {
        total: totalStmt.get().cnt,
        labeled: labeledStmt.get().cnt,
        dupes: dupesStmt.get().cnt
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Trigger scan
app.post('/api/scan', (req, res) => {
  if (scanInProgress) {
    return res.json({ status: 'Scan already in progress' });
  }
  performScan();
  res.json({ status: 'Scan started' });
});

// API: Spotify queue — SSE stream
app.get('/api/spotify/queue/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const items = db.prepare('SELECT * FROM spotify_queue ORDER BY created_at DESC').all();
  res.write(`data: ${JSON.stringify({ type: 'queue', items })}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// API: Spotify queue — list
app.get('/api/spotify/queue', (req, res) => {
  res.json(db.prepare('SELECT * FROM spotify_queue ORDER BY created_at DESC').all());
});

// API: Spotify queue — add
app.post('/api/spotify/queue', (req, res) => {
  const { url, label } = req.body;
  if (!url || !/https?:\/\/(open\.spotify\.com|www\.youtube\.com|youtu\.be|music\.youtube\.com)/.test(url)) {
    return res.status(400).json({ error: 'A valid Spotify or YouTube URL is required' });
  }
  const result = db.prepare("INSERT INTO spotify_queue (url, label, status) VALUES (?, ?, 'pending')").run(url, label || null);
  broadcastQueue();
  processQueue();
  res.json({ success: true, id: Number(result.lastInsertRowid) });
});

// API: Spotify queue — cancel / remove
app.delete('/api/spotify/queue/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const item = db.prepare('SELECT * FROM spotify_queue WHERE id=?').get(id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (item.status === 'downloading' && activeDownloadProc) {
    activeDownloadProc.kill('SIGTERM');
    db.prepare("UPDATE spotify_queue SET status='cancelled', updated_at=unixepoch() WHERE id=?").run(id);
  } else if (item.status === 'pending') {
    db.prepare("UPDATE spotify_queue SET status='cancelled', updated_at=unixepoch() WHERE id=?").run(id);
  } else {
    db.prepare('DELETE FROM spotify_queue WHERE id=?').run(id);
  }
  broadcastQueue();
  res.json({ success: true });
});

// API: Spotify queue — retry failed/cancelled
app.post('/api/spotify/queue/:id/retry', (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare("UPDATE spotify_queue SET status='pending', error=NULL, progress=NULL, updated_at=unixepoch() WHERE id=? AND status IN ('failed','cancelled')").run(id);
  broadcastQueue();
  processQueue();
  res.json({ success: true });
});

// API: Spotify queue — clear completed
app.delete('/api/spotify/queue/completed/all', (req, res) => {
  db.prepare("DELETE FROM spotify_queue WHERE status='completed'").run();
  broadcastQueue();
  res.json({ success: true });
});

// Legacy compatibility — redirect old endpoint to queue
app.post('/api/download/spotify', (req, res) => {
  const { url } = req.body;
  if (!url || !/https?:\/\/(open\.spotify\.com|www\.youtube\.com|youtu\.be|music\.youtube\.com)/.test(url)) {
    return res.status(400).json({ error: 'A valid Spotify or YouTube URL is required' });
  }
  const result = db.prepare("INSERT INTO spotify_queue (url, status) VALUES (?, 'pending')").run(url);
  broadcastQueue();
  processQueue();
  res.json({ success: true, id: Number(result.lastInsertRowid), message: 'Added to download queue' });
});

// API: Get all tracks
app.get('/api/tracks', (req, res) => {
  try {
    const query = `
      SELECT t.*, 
             (SELECT COUNT(*) FROM tracks WHERE hash = t.hash) as hash_count,
             (SELECT MIN(id) FROM tracks WHERE hash = t.hash) as first_id
      FROM tracks t
    `;
    const tracks = db.prepare(query).all();
    
    // Fetch all track tags
    const trackTagsStmt = db.prepare('SELECT track_id, tag_name FROM track_tags');
    const trackTagsRows = trackTagsStmt.all();
    const trackTagsMap = {};
    for (const row of trackTagsRows) {
      if (!trackTagsMap[row.track_id]) trackTagsMap[row.track_id] = [];
      trackTagsMap[row.track_id].push(row.tag_name);
    }
    
    // Format tracks to match frontend's expected properties
    const formatted = tracks.map(t => ({
      id: t.id,
      name: t.name,
      ext: t.name.split('.').pop(),
      path: t.rel_path,
      folderLabel: t.source,
      size: t.size,
      dur: t.duration || 0,
      dupe: t.hash_count > 1 && t.id !== t.first_id ? t.first_id : false,
      mood: t.mood || undefined,
      char: t.char_name || undefined,
      tags: trackTagsMap[t.id] || []
    }));
    
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Stream audio
app.get('/api/tracks/stream', (req, res) => {
  const trackId = req.query.id;
  if (!trackId) return res.status(400).send('Track ID is required');
  
  const absPath = resolveTrackPath(trackId);
  if (!absPath || !fs.existsSync(absPath)) {
    return res.status(404).send('Audio file not found');
  }
  
  res.sendFile(absPath);
});

// API: Get embedded track album art
app.get('/api/tracks/art', async (req, res) => {
  const trackId = req.query.id;
  if (!trackId) return res.status(400).send('Track ID is required');

  const absPath = resolveTrackPath(trackId);
  if (!absPath || !fs.existsSync(absPath)) {
    return res.status(404).send('Audio file not found');
  }

  try {
    const musicMetadata = require('music-metadata');
    const metadata = await musicMetadata.parseFile(absPath);
    const picture = metadata.common.picture && metadata.common.picture[0];
    if (picture) {
      res.setHeader('Content-Type', picture.format);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(picture.data);
    }
  } catch (err) {
    console.error('Failed to parse album art:', err);
  }
  
  // Return 404 to let frontend fallback to default icon
  res.status(404).send('No album art found');
});

// API: Update labels (mood, char, and tags)
app.post('/api/tracks/labels', (req, res) => {
  const { id, mood, char, tags } = req.body;
  if (!id) return res.status(400).json({ error: 'Track ID is required' });
  
  try {
    // 1. Auto-register character if it's new
    if (char && char.trim()) {
      const charName = char.trim();
      const checkChar = db.prepare('SELECT name FROM characters WHERE name = ?').get(charName);
      if (!checkChar) {
        const insertChar = db.prepare('INSERT INTO characters (name, role, color_idx) VALUES (?, ?, ?)');
        const colorIdx = Math.floor(Math.random() * 6);
        insertChar.run(charName, '', colorIdx);
      }
    }
    
    // 2. Update track's mood and character
    const updateStmt = db.prepare(`
      UPDATE tracks 
      SET mood = ?, char_name = ?
      WHERE id = ?
    `);
    const result = updateStmt.run(mood || null, char ? char.trim() : null, id);
    
    // 3. Sync tags
    if (Array.isArray(tags)) {
      const deleteTags = db.prepare('DELETE FROM track_tags WHERE track_id = ?');
      deleteTags.run(id);
      
      const insertTrackTag = db.prepare('INSERT OR IGNORE INTO track_tags (track_id, tag_name) VALUES (?, ?)');
      const insertTagMeta = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
      for (const t of tags) {
        if (t && t.trim()) {
          insertTagMeta.run(t.trim());
          insertTrackTag.run(id, t.trim());
        }
      }
    }
    
    res.json({ success: true, changes: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update labels in bulk (mood, char, and tags for multiple track IDs)
app.post('/api/tracks/labels/bulk', (req, res) => {
  const { ids, mood, char, tags } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required and must not be empty' });
  }
  
  try {
    // 1. Auto-register character if it's new
    if (char && char.trim()) {
      const charName = char.trim();
      const checkChar = db.prepare('SELECT name FROM characters WHERE name = ?').get(charName);
      if (!checkChar) {
        const insertChar = db.prepare('INSERT INTO characters (name, role, color_idx) VALUES (?, ?, ?)');
        const colorIdx = Math.floor(Math.random() * 6);
        insertChar.run(charName, '', colorIdx);
      }
    }
    
    // Update database atomically in a transaction
    db.exec('BEGIN TRANSACTION');
    try {
      const updateTrackStmt = db.prepare(`
        UPDATE tracks
        SET mood = ?, char_name = ?
        WHERE id = ?
      `);
      
      const deleteTagsStmt = db.prepare('DELETE FROM track_tags WHERE track_id = ?');
      const insertTrackTagStmt = db.prepare('INSERT OR IGNORE INTO track_tags (track_id, tag_name) VALUES (?, ?)');
      const insertTagMetaStmt = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');

      // Add tags to metadata once
      if (Array.isArray(tags)) {
        for (const t of tags) {
          if (t && t.trim()) {
            insertTagMetaStmt.run(t.trim());
          }
        }
      }

      for (const trackId of ids) {
        // Update track mood and character
        updateTrackStmt.run(mood || null, char ? char.trim() : null, trackId);
        
        // Update track tags
        if (Array.isArray(tags)) {
          deleteTagsStmt.run(trackId);
          for (const t of tags) {
            if (t && t.trim()) {
              insertTrackTagStmt.run(trackId, t.trim());
            }
          }
        }
      }
      
      db.exec('COMMIT');
    } catch (dbErr) {
      db.exec('ROLLBACK');
      throw dbErr;
    }

    res.json({ success: true, count: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update duration
app.post('/api/tracks/duration', (req, res) => {
  const { id, duration } = req.body;
  if (!id || duration === undefined) {
    return res.status(400).json({ error: 'Track ID and duration are required' });
  }
  
  try {
    const updateStmt = db.prepare('UPDATE tracks SET duration = ? WHERE id = ?');
    updateStmt.run(Number(duration), id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get duplicate groups (tracks sharing the same MD5 hash)
app.get('/api/tracks/dupes', (req, res) => {
  try {
    // Find all hashes that appear more than once
    const groups = db.prepare(`
      SELECT t.hash,
             t.id, t.name, t.source, t.rel_path, t.size, t.duration, t.mood, t.char_name
      FROM tracks t
      WHERE t.hash IN (
        SELECT hash FROM tracks WHERE hash IS NOT NULL GROUP BY hash HAVING COUNT(*) > 1
      )
      ORDER BY t.hash, t.id
    `).all();

    // Group by hash
    const map = {};
    for (const row of groups) {
      if (!map[row.hash]) map[row.hash] = [];
      map[row.hash].push({
        id: row.id,
        name: row.name,
        source: row.source,
        path: row.rel_path,
        size: row.size,
        dur: row.duration || 0,
        mood: row.mood,
        char: row.char_name
      });
    }

    res.json(Object.values(map));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Keep one track from a dupe group, delete the rest (files + DB rows)
app.post('/api/tracks/dupes/resolve', (req, res) => {
  const { keepId, deleteIds } = req.body;
  if (!keepId || !Array.isArray(deleteIds) || deleteIds.length === 0) {
    return res.status(400).json({ error: 'keepId and deleteIds are required' });
  }

  const deleted = [];
  const errors = [];

  // Transfer labels from deleted tracks to kept track if kept track has none
  try {
    const keepStmt = db.prepare('SELECT mood, char_name FROM tracks WHERE id = ?');
    const keepTrack = keepStmt.get(keepId);

    for (const id of deleteIds) {
      try {
        // Transfer labels if kept track has none
        if (!keepTrack.mood || !keepTrack.char_name) {
          const src = db.prepare('SELECT mood, char_name FROM tracks WHERE id = ?').get(id);
          if (src) {
            if (!keepTrack.mood && src.mood) {
              db.prepare('UPDATE tracks SET mood = ? WHERE id = ?').run(src.mood, keepId);
              keepTrack.mood = src.mood;
            }
            if (!keepTrack.char_name && src.char_name) {
              db.prepare('UPDATE tracks SET char_name = ? WHERE id = ?').run(src.char_name, keepId);
              keepTrack.char_name = src.char_name;
            }
          }
        }

        const absPath = resolveTrackPath(id);
        if (absPath && fs.existsSync(absPath)) {
          fs.unlinkSync(absPath);
        }
        db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
        deleted.push(id);
      } catch (err) {
        errors.push({ id, error: err.message });
      }
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({ success: true, deleted, errors });
});

// API: Delete physical file (duplicate deletion)
app.delete('/api/tracks/file', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Track ID is required' });
  
  const absPath = resolveTrackPath(id);
  if (!absPath) {
    return res.status(404).json({ error: 'Track not found' });
  }
  
  try {
    if (fs.existsSync(absPath)) {
      fs.unlinkSync(absPath);
    }
    
    const deleteStmt = db.prepare('DELETE FROM tracks WHERE id = ?');
    deleteStmt.run(id);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete file: ${err.message}` });
  }
});

// API: Rename track file physically on disk and update DB
app.post('/api/tracks/rename', (req, res) => {
  const { id, newName } = req.body;
  if (!id || !newName) return res.status(400).json({ error: 'Track ID and new name are required' });
  
  if (newName.includes('/') || newName.includes('\\')) {
    return res.status(400).json({ error: 'Invalid file name' });
  }
  
  try {
    const getStmt = db.prepare('SELECT source, rel_path, name FROM tracks WHERE id = ?');
    const track = getStmt.get(id);
    if (!track) return res.status(404).json({ error: 'Track not found' });
    
    const folderEntry = getScanFolders().find(f => f.name === track.source);
    const root = folderEntry ? folderEntry.path : musicRoot;
    const oldAbsPath = path.join(root, track.rel_path);
    if (!fs.existsSync(oldAbsPath)) {
      return res.status(404).json({ error: 'Physical file not found on disk' });
    }
    
    const oldExt = path.extname(track.name);
    let finalName = newName.trim();
    const hasOldExt = finalName.toLowerCase().endsWith(oldExt.toLowerCase());
    let hasValidExt = false;
    for (const ext of AUDIO_EXT) {
      if (finalName.toLowerCase().endsWith('.' + ext)) {
        hasValidExt = true;
        break;
      }
    }
    if (!hasOldExt && !hasValidExt) {
      finalName += oldExt;
    }
    
    const dir = path.dirname(track.rel_path);
    const newRelPath = dir === '.' ? finalName : path.join(dir, finalName);
    const newAbsPath = path.join(root, newRelPath);
    const newId = `${track.source}|${newRelPath}`;
    
    if (fs.existsSync(newAbsPath) && oldAbsPath !== newAbsPath) {
      return res.status(400).json({ error: 'A file with that name already exists' });
    }
    
    // Rename physical file
    fs.renameSync(oldAbsPath, newAbsPath);
    
    // Update database atomically in a transaction
    db.exec('BEGIN TRANSACTION');
    try {
      const updateTags = db.prepare('UPDATE track_tags SET track_id = ? WHERE track_id = ?');
      updateTags.run(newId, id);
      
      const updateTrack = db.prepare(`
        UPDATE tracks 
        SET id = ?, name = ?, rel_path = ?
        WHERE id = ?
      `);
      updateTrack.run(newId, finalName, newRelPath, id);
      
      db.exec('COMMIT');
    } catch (dbErr) {
      db.exec('ROLLBACK');
      try { fs.renameSync(newAbsPath, oldAbsPath); } catch(revertErr) {}
      throw dbErr;
    }

    res.json({ success: true, newId, newName: finalName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get characters
app.get('/api/characters', (req, res) => {
  try {
    const chars = db.prepare('SELECT name, role, color_idx as colorIdx FROM characters').all();
    res.json(chars);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Add character
app.post('/api/characters', (req, res) => {
  const { name, role, colorIdx } = req.body;
  if (!name) return res.status(400).json({ error: 'Character name is required' });
  
  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO characters (name, role, color_idx)
      VALUES (?, ?, ?)
    `);
    insertStmt.run(name.trim(), role ? role.trim() : '', Number(colorIdx || 0));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Delete character
app.delete('/api/characters', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Character name is required' });
  
  try {
    const deleteStmt = db.prepare('DELETE FROM characters WHERE name = ?');
    deleteStmt.run(name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Rename character and update references
app.post('/api/characters/rename', (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).json({ error: 'Old name and new name are required' });
  
  try {
    db.exec('BEGIN TRANSACTION');
    try {
      const insertChar = db.prepare('INSERT OR IGNORE INTO characters (name, role, color_idx) SELECT ?, role, color_idx FROM characters WHERE name = ?');
      insertChar.run(newName.trim(), oldName);
      
      const updateTracks = db.prepare('UPDATE tracks SET char_name = ? WHERE char_name = ?');
      updateTracks.run(newName.trim(), oldName);
      
      const deleteChar = db.prepare('DELETE FROM characters WHERE name = ?');
      deleteChar.run(oldName);
      
      db.exec('COMMIT');
    } catch (dbErr) {
      db.exec('ROLLBACK');
      throw dbErr;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get moods
app.get('/api/moods', (req, res) => {
  try {
    const moods = db.prepare('SELECT name, color FROM moods').all();
    res.json(moods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Add mood
app.post('/api/moods', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Mood name is required' });
  
  try {
    const insert = db.prepare('INSERT OR REPLACE INTO moods (name, color) VALUES (?, ?)');
    insert.run(name.trim(), color || '#7c5cbf');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Delete mood
app.delete('/api/moods', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Mood name is required' });
  
  try {
    const del = db.prepare('DELETE FROM moods WHERE name = ?');
    del.run(name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Rename mood and update references
app.post('/api/moods/rename', (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).json({ error: 'Old name and new name are required' });
  
  try {
    db.exec('BEGIN TRANSACTION');
    try {
      const insertMood = db.prepare('INSERT OR IGNORE INTO moods (name, color) SELECT ?, color FROM moods WHERE name = ?');
      insertMood.run(newName.trim(), oldName);

      const updateTracks = db.prepare('UPDATE tracks SET mood = ? WHERE mood = ?');
      updateTracks.run(newName.trim(), oldName);

      const deleteMood = db.prepare('DELETE FROM moods WHERE name = ?');
      deleteMood.run(oldName);

      db.exec('COMMIT');
    } catch (dbErr) {
      db.exec('ROLLBACK');
      throw dbErr;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get tags
app.get('/api/tags', (req, res) => {
  try {
    const tags = db.prepare('SELECT name FROM tags').all();
    res.json(tags.map(t => t.name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Add tag
app.post('/api/tags', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Tag name is required' });
  
  try {
    const insert = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    insert.run(name.trim());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Delete tag
app.delete('/api/tags', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Tag name is required' });
  
  try {
    const del = db.prepare('DELETE FROM tags WHERE name = ?');
    del.run(name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Rename tag and update references
app.post('/api/tags/rename', (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).json({ error: 'Old name and new name are required' });
  
  try {
    db.exec('BEGIN TRANSACTION');
    try {
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
      insertTag.run(newName.trim());

      const updateTrackTags = db.prepare('UPDATE track_tags SET tag_name = ? WHERE tag_name = ?');
      updateTrackTags.run(newName.trim(), oldName);

      const deleteTag = db.prepare('DELETE FROM tags WHERE name = ?');
      deleteTag.run(oldName);

      db.exec('COMMIT');
    } catch (dbErr) {
      db.exec('ROLLBACK');
      throw dbErr;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Migrate localStorage labels/characters from client
app.post('/api/migrate', (req, res) => {
  const { labels, characters } = req.body;
  
  try {
    if (Array.isArray(characters)) {
      const charStmt = db.prepare(`
        INSERT OR REPLACE INTO characters (name, role, color_idx)
        VALUES (?, ?, ?)
      `);
      for (const char of characters) {
        if (char && char.name) {
          charStmt.run(char.name, char.role || '', Number(char.colorIdx || 0));
        }
      }
    }
    
    if (labels && typeof labels === 'object') {
      const labelStmt = db.prepare(`
        UPDATE tracks
        SET mood = ?, char_name = ?
        WHERE id = ?
      `);
      for (const [trackId, data] of Object.entries(labels)) {
        if (data) {
          let moodName = data.mood || null;
          if (moodName) {
            const map = {
              combat: 'Combat / Battle',
              mystery: 'Mystery / Tension',
              tavern: 'Tavern / Town',
              ambient: 'Ambient / Explore',
              boss: 'Boss Encounter',
              sad: 'Sad / Emotional',
              epic: 'Epic / Cinematic',
              rest: 'Safe Haven / Rest'
            };
            if (map[moodName.toLowerCase()]) {
              moodName = map[moodName.toLowerCase()];
            }
          }
          labelStmt.run(moodName, data.char || null, trackId);
        }
      }
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Scan folders CRUD
app.get('/api/scan-folders', (req, res) => {
  res.json(getScanFolders());
});

app.post('/api/scan-folders', (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'folderPath is required' });
  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved)) return res.status(400).json({ error: 'Path does not exist on server' });
  // Derive name from last path segment, ensure uniqueness
  let name = path.basename(resolved);
  const existing = db.prepare('SELECT name FROM scan_folders WHERE name LIKE ?').all(name + '%');
  if (existing.length) name = name + '_' + (existing.length + 1);
  try {
    db.prepare('INSERT INTO scan_folders (name, path) VALUES (?, ?)').run(name, resolved);
    res.json({ ok: true, folder: { name, path: resolved } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/scan-folders/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const row = db.prepare('SELECT * FROM scan_folders WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const count = db.prepare('SELECT COUNT(*) as c FROM scan_folders').get().c;
  if (count <= 1) return res.status(400).json({ error: 'Cannot remove the last scan folder' });
  db.prepare('DELETE FROM scan_folders WHERE id = ?').run(id);
  res.json({ ok: true });
});

// API: Browse server filesystem directories
app.get('/api/browse', (req, res) => {
  const reqPath = req.query.path || '';
  let target;
  if (!reqPath) {
    // Return drive roots on Windows, / on Unix
    if (process.platform === 'win32') {
      const drives = [];
      for (let c = 65; c <= 90; c++) {
        const d = String.fromCharCode(c) + ':\\';
        try { fs.readdirSync(d); drives.push({ name: d, path: d, isRoot: true }); } catch {}
      }
      return res.json({ path: '', parent: null, dirs: drives });
    }
    target = '/';
  } else {
    target = path.resolve(reqPath);
  }
  try {
    const entries = fs.readdirSync(target, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({ name: e.name, path: path.join(target, e.name) }));
    const parent = path.dirname(target) !== target ? path.dirname(target) : null;
    res.json({ path: target, parent, dirs });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// API: Organize preview — dry-run, returns grouped plan without touching files
app.get('/api/tracks/organize/preview', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT t.id, t.name, t.mood, t.char_name,
             (SELECT GROUP_CONCAT(tag_name) FROM track_tags WHERE track_id = t.id) as tags_list
      FROM tracks t
    `).all();

    const labeled = [], unlabeled = [];
    const groups = {};   // destFolder → [filename, ...]
    const conflicts = []; // files that would overwrite

    for (const t of rows) {
      let folder = null;
      if (t.char_name)        folder = `Characters/${t.char_name}`;
      else if (t.mood)        folder = `Mood/${t.mood.replace(/[\/\\:*?"<>|]/g, '_')}`;
      else if (t.tags_list)   folder = `Tags/${t.tags_list.split(',')[0].replace(/[\/\\:*?"<>|]/g, '_')}`;

      if (!folder) { unlabeled.push({ id: t.id, name: t.name }); continue; }

      labeled.push(t);
      if (!groups[folder]) groups[folder] = [];
      const prev = groups[folder].find(f => f === t.name);
      if (prev) conflicts.push({ folder, name: t.name });
      groups[folder].push(t.name);
    }

    const summary = Object.entries(groups).map(([folder, files]) => ({ folder, count: files.length, files }));
    summary.sort((a, b) => a.folder.localeCompare(b.folder));

    res.json({
      total: rows.length,
      willOrganize: labeled.length,
      unlabeled: unlabeled.length,
      conflicts: conflicts.length,
      groups: summary,
      unlabeledTracks: unlabeled
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Organize music files into destination path
app.post('/api/tracks/organize', async (req, res) => {
  const { destPath, mode } = req.body; // mode: 'copy' or 'move'
  if (!destPath) return res.status(400).json({ error: 'Destination path is required' });
  if (mode !== 'copy' && mode !== 'move') return res.status(400).json({ error: 'Mode must be copy or move' });
  
  try {
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }
    
    const tracks = db.prepare(`
      SELECT t.id, t.name, t.mood, t.char_name, 
             (SELECT GROUP_CONCAT(tag_name) FROM track_tags WHERE track_id = t.id) as tags_list
      FROM tracks t 
      WHERE t.mood IS NOT NULL OR t.char_name IS NOT NULL OR tags_list IS NOT NULL
    `).all();
    
    let processed = 0;
    let errors = 0;
    
    for (const t of tracks) {
      const absPath = resolveTrackPath(t.id);
      if (!absPath || !fs.existsSync(absPath)) {
        errors++;
        continue;
      }
      
      let subDirName = 'Unsorted';
      if (t.char_name) {
        subDirName = path.join('Characters', t.char_name);
      } else if (t.mood) {
        subDirName = path.join('Mood', t.mood.replace(/[\/\\:*?"<>|]/g, '_'));
      } else if (t.tags_list) {
        const firstTag = t.tags_list.split(',')[0];
        subDirName = path.join('Tags', firstTag.replace(/[\/\\:*?"<>|]/g, '_'));
      }
      
      const targetDir = path.join(destPath, subDirName);
      const targetFile = path.join(targetDir, t.name);
      
      try {
        fs.mkdirSync(targetDir, { recursive: true });
        
        if (mode === 'copy') {
          fs.copyFileSync(absPath, targetFile);
        } else if (mode === 'move') {
          fs.renameSync(absPath, targetFile);
          const deleteStmt = db.prepare('DELETE FROM tracks WHERE id = ?');
          deleteStmt.run(t.id);
        }
        processed++;
      } catch (err) {
        console.error(`Failed to organize file ${t.name}:`, err);
        errors++;
      }
    }
    
    res.json({
      success: true,
      processed,
      errors,
      message: `Successfully organized ${processed} files with ${errors} errors.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Trim audio file using ffmpeg
app.post('/api/tracks/trim', async (req, res) => {
  const { id, start, end } = req.body;
  if (!id || start == null || end == null) {
    return res.status(400).json({ error: 'id, start, and end (seconds) are required' });
  }
  if (typeof start !== 'number' || typeof end !== 'number' || start < 0 || end <= start) {
    return res.status(400).json({ error: 'start must be >= 0 and end must be > start' });
  }

  const srcPath = resolveTrackPath(id);
  if (!srcPath) return res.status(404).json({ error: 'Track not found or path unsafe' });

  const ext = path.extname(srcPath);
  const tmpPath = srcPath.replace(ext, `__trim_tmp${ext}`);

  try {
    await new Promise((resolve, reject) => {
      // -ss before -i for fast seek; hwaccel accelerates decode of video-container sources (mp4/webm from yt-dlp)
      const duration = end - start;
      const proc = spawn('ffmpeg', [
        '-y', ...ffmpegHwaccel, '-ss', String(start), '-i', srcPath,
        '-t', String(duration),
        '-map', '0:a', '-c:a', 'copy',
        tmpPath
      ]);

      let errOut = '';
      proc.stderr.on('data', d => { errOut += d.toString(); });
      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${errOut.slice(-300)}`));
      });
    });

    // Atomically replace original with trimmed version
    fs.renameSync(tmpPath, srcPath);

    // Invalidate cached mtime so next scan picks up the change
    db.prepare('UPDATE tracks SET mtime = 0, duration = NULL WHERE id = ?').run(id);

    res.json({ success: true, message: `Trimmed to ${start}s – ${end}s` });
  } catch (err) {
    // Clean up temp file if it exists
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`DnD Music Forge server running on http://localhost:${PORT}`);
  performScan();
});
