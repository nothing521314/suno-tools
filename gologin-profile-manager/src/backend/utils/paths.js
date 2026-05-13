/**
 * Path utilities cho Backend - Xác định đường dẫn đúng cho cả dev và production
 * Sử dụng biến môi trường APP_BASE_PATH được truyền từ Electron main process
 */

const path = require('path');
const os = require('os');

/**
 * Kiểm tra đang chạy trong production hay development
 */
function isPackaged() {
  // Sử dụng biến môi trường từ Electron main process
  return !!process.env.APP_BASE_PATH && !!process.env.APP_RESOURCES_PATH;
}

/**
 * Lấy đường dẫn gốc của ứng dụng
 * - Development: thư mục project (gologin-profiles)
 * - Production: thư mục chứa exe (win-unpacked hoặc nơi portable exe chạy)
 */
function getAppPath() {
  // Sử dụng biến môi trường nếu có
  if (process.env.APP_BASE_PATH) {
    return process.env.APP_BASE_PATH;
  }
  // Fallback: Development mode
  return path.resolve(__dirname, '..', '..', '..');
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
  // Sử dụng biến môi trường nếu có (standalone build)
  if (process.env.APP_RESOURCES_PATH) {
    return path.join(process.env.APP_RESOURCES_PATH, `orbita-browser-${version}`);
  }
  // Fallback: Development mode
  return path.join(os.homedir(), '.gologin', 'browser', `orbita-browser-${version}`);
}

module.exports = {
  isPackaged,
  getAppPath,
  getProfilesPath,
  getDataPath,
  getOrbitaBrowserPath
};
