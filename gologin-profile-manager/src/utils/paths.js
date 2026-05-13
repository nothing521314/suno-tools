/**
 * Path utilities - Xác định đường dẫn đúng cho cả dev và production
 */

const path = require('path');
const { app } = require('electron');

/**
 * Kiểm tra đang chạy trong production hay development
 */
function isPackaged() {
  // Khi build với electron-builder, app.isPackaged = true
  return app && app.isPackaged;
}

/**
 * Lấy đường dẫn gốc của ứng dụng
 * - Development: thư mục project
 * - Production: thư mục chứa app.asar hoặc resources
 */
function getAppPath() {
  if (isPackaged()) {
    // Production: process.resourcesPath trỏ đến thư mục resources
    return path.dirname(app.getPath('exe'));
  }
  // Development: thư mục project
  return path.resolve(__dirname, '..', '..');
}

/**
 * Lấy đường dẫn thư mục profiles
 * - data/profiles/ để tách riêng khỏi code, tránh mất khi update
 */
function getProfilesPath() {
  return path.join(getAppPath(), 'data', 'profiles');
}

/**
 * Lấy đường dẫn thư mục data (settings, metadata, logs, scripts)
 * - data/ để tách riêng khỏi code, tránh mất khi update
 */
function getDataPath() {
  return path.join(getAppPath(), 'data');
}

/**
 * Lấy đường dẫn orbita-browser
 * @param {number|null} browserVersion - Version browser, null = legacy (143)
 */
function getOrbitaBrowserPath(browserVersion = null) {
  const version = browserVersion || 144;
  if (isPackaged()) {
    // Production: trong thư mục resources
    return path.join(process.resourcesPath, `orbita-browser-${version}`);
  }
  // Development: thư mục gologin mặc định
  const homeDir = require('os').homedir();
  return path.join(homeDir, '.gologin', 'browser', `orbita-browser-${version}`);
}

module.exports = {
  isPackaged,
  getAppPath,
  getProfilesPath,
  getDataPath,
  getOrbitaBrowserPath
};
