/**
 * Browser Service - Quản lý khởi động và dừng browser
 * Sử dụng ZUtils để launch browser với profile
 */

const path = require('path');
const fs = require('fs');
const logger = require('../../../logger');
const ProcessManager = require('../utils/processManager');
const PortManager = require('../utils/portManager');
const ProfileService = require('./profileService');
const PiaProxyService = require('./piaProxyService');
const { ZUtils } = require('../../../zutils');
const { getProfilesPath } = require('../utils/paths');

// Đường dẫn cơ sở - sử dụng module paths
const PROFILES_PATH = getProfilesPath();

class BrowserService {
  /**
   * Khởi động browser với profile
   * @param {string} profileId - ID của profile
   * @param {Object|null} proxy - Proxy config (optional, sẽ lấy từ metadata nếu không truyền)
   * @returns {Promise<Object>} { profileId, pid, status }
   */
  static async startBrowser(profileId, proxy = null) {
    logger.info(`[BrowserService] Starting browser for profile: ${profileId}`);

    // Kiểm tra đã chạy chưa
    if (ProcessManager.isRunning(profileId)) {
      throw new Error(`Profile ${profileId} is already running`);
    }

    // Lấy thông tin profile
    const profile = await ProfileService.getById(profileId);
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }

    // Sử dụng proxy từ tham số hoặc từ metadata
    let proxyConfig = proxy || profile.proxy;

    // Xử lý PIA Proxy - tự động order nếu là PIA proxy
    if (proxyConfig && (proxyConfig.mode === 'pia' || (proxyConfig.mode === 'socks5' && proxyConfig.piaCountry))) {
      logger.info(`[BrowserService] Profile ${profileId} uses PIA Proxy, checking and ordering...`);

      const piaResult = await PiaProxyService.checkAndReorderProxy(profileId, proxyConfig);

      if (!piaResult.success) {
        throw new Error(`Failed to order PIA proxy: ${piaResult.error}`);
      }

      // Update proxy config with new PIA proxy
      proxyConfig = piaResult.proxy;

      // Save updated proxy to metadata if reordered
      if (piaResult.needsReorder) {
        const metadata = ProfileService.loadMetadata();
        if (metadata.profiles[profileId]) {
          metadata.profiles[profileId].proxy = proxyConfig;
          ProfileService.saveMetadata(metadata);
          logger.info(`[BrowserService] Updated PIA proxy in metadata for profile ${profileId}`);
        }
      }
    }

    // Đường dẫn profile - trực tiếp từ profiles/{platform}/{profileId}
    const platform = profile.platform || 'win';
    const profilePath = path.join(PROFILES_PATH, platform, profileId);

    // Browser version: profile cũ không có field này -> dùng null (legacy 142)
    const browserVersion = profile.browserVersion || null;

    // Kiểm tra folder profile tồn tại
    if (!fs.existsSync(profilePath)) {
      throw new Error(`Profile ${profileId} not found on disk`);
    }

    logger.info(`[BrowserService] Using profile folder: ${profilePath}`);

    try {
      // Allocate CDP debug port
      const debugPort = PortManager.allocate(profileId);

      // Launch browser sử dụng ZUtils
      logger.info(`[BrowserService] Launching browser with profile: ${profilePath}, debugPort: ${debugPort}`);
      const childProcess = await ZUtils.launchBrowserWithProcess(profilePath, proxyConfig, profile.name, debugPort, browserVersion);

      // Thêm vào ProcessManager
      ProcessManager.addProcess(profileId, childProcess, debugPort);

      // Cập nhật lastUsedAt
      const metadata = ProfileService.loadMetadata();
      if (metadata.profiles[profileId]) {
        metadata.profiles[profileId].lastUsedAt = new Date().toISOString();
        ProfileService.saveMetadata(metadata);
      }

      logger.info(`[BrowserService] Browser started for profile ${profileId}, PID: ${childProcess.pid}`);

      return {
        profileId,
        pid: childProcess.pid,
        status: 'running'
      };
    } catch (error) {
      logger.error(`[BrowserService] Failed to start browser: ${error.message}`);

      // Release port on failure
      PortManager.release(profileId);

      // Nếu lỗi do proxy die và là PIA proxy, thử order lại và retry
      if (proxyConfig && (proxyConfig.mode === 'pia' || proxyConfig.piaCountry) &&
          (error.message.includes('Proxy') || error.message.includes('proxy') || error.message.includes('SOCKS'))) {

        logger.info(`[BrowserService] Proxy appears dead, attempting to re-order PIA proxy...`);

        const reorderResult = await PiaProxyService.forceReorderProxy(profileId, proxyConfig);

        if (reorderResult.success) {
          proxyConfig = reorderResult.proxy;

          // Save new proxy to metadata
          const metadata = ProfileService.loadMetadata();
          if (metadata.profiles[profileId]) {
            metadata.profiles[profileId].proxy = proxyConfig;
            ProfileService.saveMetadata(metadata);
            logger.info(`[BrowserService] Updated PIA proxy in metadata, retrying browser launch...`);
          }

          // Retry launch browser
          try {
            const retryDebugPort = PortManager.allocate(profileId);
            const childProcess = await ZUtils.launchBrowserWithProcess(profilePath, proxyConfig, profile.name, retryDebugPort, browserVersion);
            ProcessManager.addProcess(profileId, childProcess, retryDebugPort);

            const metadata2 = ProfileService.loadMetadata();
            if (metadata2.profiles[profileId]) {
              metadata2.profiles[profileId].lastUsedAt = new Date().toISOString();
              ProfileService.saveMetadata(metadata2);
            }

            logger.info(`[BrowserService] Browser started on retry for profile ${profileId}, PID: ${childProcess.pid}`);

            return {
              profileId,
              pid: childProcess.pid,
              status: 'running'
            };
          } catch (retryError) {
            logger.error(`[BrowserService] Retry failed: ${retryError.message}`);
            throw retryError;
          }
        } else {
          logger.error(`[BrowserService] Failed to re-order PIA proxy: ${reorderResult.error}`);
        }
      }

      throw error;
    }
  }

  /**
   * Dừng browser của profile
   * @param {string} profileId - ID của profile
   * @returns {Promise<Object>} { profileId, status }
   */
  static async stopBrowser(profileId) {
    logger.info(`[BrowserService] Stopping browser for profile: ${profileId}`);

    if (!ProcessManager.isRunning(profileId)) {
      logger.warn(`[BrowserService] Profile ${profileId} is not running`);
      return {
        profileId,
        status: 'stopped'
      };
    }

    const killed = ProcessManager.killProcess(profileId);

    // Giải phóng CDP port
    PortManager.release(profileId);

    if (killed) {
      logger.info(`[BrowserService] Browser stopped for profile: ${profileId}`);
      // Không xóa folder tmp - giữ lại session, cookies, history...
    }

    return {
      profileId,
      status: 'stopped'
    };
  }

  /**
   * Dừng tất cả browsers đang chạy
   * @returns {Promise<void>}
   */
  static async stopAll() {
    logger.info(`[BrowserService] Stopping all browsers...`);
    ProcessManager.killAll();
    PortManager.releaseAll();
    logger.info(`[BrowserService] All browsers stopped`);
  }

  /**
   * Lấy trạng thái tất cả browsers đang chạy
   * @returns {Array} Danh sách profiles đang chạy
   */
  static getRunningBrowsers() {
    return ProcessManager.getAllRunning();
  }
}

module.exports = BrowserService;
