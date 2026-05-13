/**
 * Express API Server - Entry point cho backend
 */

// Force IPv4 để tránh timeout khi kết nối external APIs
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getDataPath, getAppPath, getProfilesPath } = require('./utils/paths');

// Load environment variables
require('dotenv').config({ path: path.join(getAppPath(), '.env') });

const logger = require('../../logger');
const profileRoutes = require('./routes/profiles');
const scriptRoutes = require('./routes/scripts');
const errorHandler = require('./middleware/errorHandler');
const BrowserService = require('./services/browserService');
const { getStatus, getAllTags, getPiaCountries, getPiaStatus, orderPiaProxy, getSettings, setProfilesFolder, getSettingsTags, addSettingsTag, deleteSettingsTag } = require('./controllers/profileController');

const app = express();
const PORT = process.env.API_PORT || 3000;
const LOG_FILE = path.join(getAppPath(), 'profiles.log');

// Đảm bảo thư mục data tồn tại
fs.mkdirSync(getDataPath(), { recursive: true });
fs.mkdirSync(getProfilesPath(), { recursive: true });

// Migration: di chuyển dữ liệu từ cấu trúc cũ (root) sang data/
(function migrateOldData() {
  const appPath = getAppPath();
  const dataPath = getDataPath();

  // Di chuyển profiles_metadata.json
  const oldMeta = path.join(appPath, 'profiles_metadata.json');
  const newMeta = path.join(dataPath, 'profiles_metadata.json');
  if (fs.existsSync(oldMeta) && !fs.existsSync(newMeta)) {
    fs.renameSync(oldMeta, newMeta);
    console.log('[Migration] Moved profiles_metadata.json -> data/');
  }

  // Di chuyển settings.json
  const oldSettings = path.join(appPath, 'settings.json');
  const newSettings = path.join(dataPath, 'settings.json');
  if (fs.existsSync(oldSettings) && !fs.existsSync(newSettings)) {
    fs.renameSync(oldSettings, newSettings);
    console.log('[Migration] Moved settings.json -> data/');
  }

  // Di chuyển profiles/
  const oldProfiles = path.join(appPath, 'profiles');
  const newProfiles = getProfilesPath();
  if (fs.existsSync(oldProfiles) && oldProfiles !== newProfiles) {
    const platforms = ['win', 'mac', 'lin', 'android'];
    for (const p of platforms) {
      const oldPlatform = path.join(oldProfiles, p);
      if (!fs.existsSync(oldPlatform)) continue;
      const newPlatform = path.join(newProfiles, p);
      fs.mkdirSync(newPlatform, { recursive: true });
      const entries = fs.readdirSync(oldPlatform);
      for (const entry of entries) {
        const oldEntry = path.join(oldPlatform, entry);
        const newEntry = path.join(newPlatform, entry);
        if (!fs.existsSync(newEntry)) {
          fs.renameSync(oldEntry, newEntry);
        }
      }
    }
    // Xóa thư mục profiles cũ nếu rỗng
    try { fs.rmSync(oldProfiles, { recursive: true }); } catch (e) {}
    console.log('[Migration] Moved profiles/ -> data/profiles/');
  }

  // Di chuyển automation-scripts/
  const oldScripts = path.join(appPath, 'automation-scripts');
  const newScripts = path.join(dataPath, 'automation-scripts');
  if (fs.existsSync(oldScripts) && !fs.existsSync(newScripts)) {
    fs.renameSync(oldScripts, newScripts);
    console.log('[Migration] Moved automation-scripts/ -> data/');
  }
})();

// Store for log file position
let lastLogPosition = 0;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info(`[Server] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Server is running',
    timestamp: new Date().toISOString()
  });
});

// Status endpoint
app.get('/api/v1/status', getStatus);

// Tags endpoint
app.get('/api/v1/tags', getAllTags);

// PIA Proxy endpoints
app.get('/api/v1/pia/countries', getPiaCountries);
app.get('/api/v1/pia/status', getPiaStatus);
app.post('/api/v1/pia/order', orderPiaProxy);

// Settings endpoints
app.get('/api/v1/settings', getSettings);
app.put('/api/v1/settings/profiles-folder', setProfilesFolder);
app.get('/api/v1/settings/tags', getSettingsTags);
app.post('/api/v1/settings/tags', addSettingsTag);
app.delete('/api/v1/settings/tags/:tag', deleteSettingsTag);

// Logs endpoint
app.get('/api/v1/logs', (req, res) => {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return res.json({
        success: true,
        data: { logs: [], lastTimestamp: null }
      });
    }

    const stats = fs.statSync(LOG_FILE);
    const fileSize = stats.size;

    // If file was truncated or this is first read, start from end - 10KB
    if (lastLogPosition > fileSize || lastLogPosition === 0) {
      lastLogPosition = Math.max(0, fileSize - 10240);
    }

    // Read new content
    const fd = fs.openSync(LOG_FILE, 'r');
    const bufferSize = fileSize - lastLogPosition;

    if (bufferSize <= 0) {
      fs.closeSync(fd);
      return res.json({
        success: true,
        data: { logs: [], lastTimestamp: new Date().toISOString() }
      });
    }

    const buffer = Buffer.alloc(bufferSize);
    fs.readSync(fd, buffer, 0, bufferSize, lastLogPosition);
    fs.closeSync(fd);

    lastLogPosition = fileSize;

    // Parse logs
    const content = buffer.toString('utf8');
    const lines = content.split('\n').filter(line => line.trim());

    res.json({
      success: true,
      data: {
        logs: lines.slice(-100), // Last 100 lines
        lastTimestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`[Server] Logs endpoint error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Routes
app.use('/api/v1/profiles', profileRoutes);
app.use('/api/v1/scripts', scriptRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`
  });
});

// Error handling
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`[Server] =================================`);
  logger.info(`[Server] GoLogin Profile Manager API`);
  logger.info(`[Server] Running on port ${PORT}`);
  logger.info(`[Server] http://localhost:${PORT}/api/v1`);
  logger.info(`[Server] =================================`);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`[Server] Received ${signal}, shutting down gracefully...`);

  // Dừng tất cả browsers
  await BrowserService.stopAll();

  // Đóng server
  server.close(() => {
    logger.info(`[Server] Server closed`);
    process.exit(0);
  });

  // Force close sau 10 giây
  setTimeout(() => {
    logger.error(`[Server] Could not close connections in time, forcefully shutting down`);
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Xử lý uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`[Server] Uncaught Exception: ${error.message}`);
  logger.error(error.stack);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`[Server] Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

module.exports = app;
