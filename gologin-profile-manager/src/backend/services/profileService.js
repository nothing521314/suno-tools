/**
 * Profile Service - Quản lý CRUD cho profiles
 * Đọc/ghi metadata và files của profiles
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../../../logger');
const ProcessManager = require('../utils/processManager');
const SettingsService = require('./settingsService');
const { getAppPath, getProfilesPath, getDataPath } = require('../utils/paths');
const { DEFAULT_BROWSER_VERSION } = require('../../../zutils');
const { safeWriteFileSync, safeLoadJSON } = require('../utils/safeWrite');

// Đường dẫn cơ sở - sử dụng module paths
const PROFILES_PATH = getProfilesPath();
const METADATA_PATH = path.join(getDataPath(), 'profiles_metadata.json');

// Import functions từ index.js
const { getNewProfile } = require('../../../index');

class ProfileService {
  /**
   * Đọc metadata từ file JSON (với auto-recovery từ backup)
   * @returns {Object} Metadata object
   */
  static loadMetadata() {
    return safeLoadJSON(METADATA_PATH, { profiles: {} });
  }

  /**
   * Lưu metadata vào file JSON (atomic write + backup)
   * @param {Object} metadata - Metadata object
   */
  static saveMetadata(metadata) {
    safeWriteFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));
    logger.debug(`[ProfileService] Metadata saved`);
  }

  /**
   * Tạo profile mới với fingerprint random
   * @param {string} name - Tên profile (optional)
   * @param {string} platform - Platform (win, mac, lin, android)
   * @param {Object} proxy - Proxy config (optional)
   * @returns {Promise<Object>} Profile info
   */
  static async create(name = null, platform = 'win', proxy = null) {
    // Tạo profileId
    const profileId = crypto.randomBytes(6).toString('hex').toUpperCase();
    const displayName = name || `Profile_${profileId}`;

    logger.info(`[ProfileService] Creating new profile: ${displayName} (${profileId})`);

    // Đảm bảo thư mục tồn tại
    fs.mkdirSync(path.join(PROFILES_PATH, platform), { recursive: true });

    try {
      // Sử dụng hàm getNewProfile từ index.js để tạo profile (không còn zip)
      await getNewProfile(platform, profileId);

      // Lưu metadata
      const metadata = this.loadMetadata();
      metadata.profiles[profileId] = {
        profileId,
        name: displayName,
        platform,
        proxy: proxy || null,
        browserVersion: DEFAULT_BROWSER_VERSION,
        createdAt: new Date().toISOString(),
        lastUsedAt: null
      };
      this.saveMetadata(metadata);

      logger.info(`[ProfileService] Profile created successfully: ${profileId}`);

      return {
        profileId,
        name: displayName,
        platform,
        status: 'stopped',
        proxy: proxy || null,
        createdAt: metadata.profiles[profileId].createdAt
      };
    } catch (error) {
      logger.error(`[ProfileService] Failed to create profile: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lấy danh sách tất cả profiles
   * @returns {Promise<Array>} Mảng profiles
   */
  static async listAll() {
    const metadata = this.loadMetadata();
    const profiles = [];

    // Auto-cleanup: loại bỏ zombie entries (metadata tồn tại nhưng folder đã bị xóa)
    let zombieCount = 0;
    for (const [profileId, profileMeta] of Object.entries(metadata.profiles)) {
      const platform = profileMeta.platform || 'win';
      const folderPath = path.join(PROFILES_PATH, platform, profileId);
      if (!fs.existsSync(folderPath)) {
        delete metadata.profiles[profileId];
        zombieCount++;
      }
    }
    if (zombieCount > 0) {
      logger.info(`[ProfileService] Auto-cleanup: đã xóa ${zombieCount} zombie entries khỏi metadata`);
      this.saveMetadata(metadata);
    }

    // Duyệt qua các platform
    const platforms = ['win', 'mac', 'lin', 'android'];

    for (const platform of platforms) {
      const platformPath = path.join(PROFILES_PATH, platform);

      if (!fs.existsSync(platformPath)) continue;

      const entries = fs.readdirSync(platformPath, { withFileTypes: true });

      for (const entry of entries) {
        // Chỉ lấy các folder (không còn file .zip)
        if (!entry.isDirectory()) continue;

        const profileId = entry.name;

        // Lấy metadata hoặc tạo mới nếu chưa có
        let profileMeta = metadata.profiles[profileId];

        if (!profileMeta) {
          // Profile tồn tại nhưng chưa có metadata
          profileMeta = {
            profileId,
            name: `Profile_${profileId}`,
            platform,
            proxy: null,
            createdAt: new Date().toISOString(),
            lastUsedAt: null
          };
          metadata.profiles[profileId] = profileMeta;
        }

        profiles.push({
          ...profileMeta,
          status: ProcessManager.isRunning(profileId) ? 'running' : 'stopped',
          pid: ProcessManager.isRunning(profileId) ? ProcessManager.getProcess(profileId)?.pid : null
        });
      }
    }

    // Lưu metadata đã cập nhật
    this.saveMetadata(metadata);

    logger.debug(`[ProfileService] Listed ${profiles.length} profiles`);
    return profiles;
  }

  /**
   * Lấy thông tin chi tiết một profile
   * @param {string} profileId - ID của profile
   * @returns {Promise<Object|null>} Profile info hoặc null
   */
  static async getById(profileId) {
    const metadata = this.loadMetadata();
    const profileMeta = metadata.profiles[profileId];

    if (!profileMeta) {
      // Tìm trong các thư mục
      const platforms = ['win', 'mac', 'lin', 'android'];
      for (const platform of platforms) {
        const folderPath = path.join(PROFILES_PATH, platform, profileId);

        if (fs.existsSync(folderPath)) {
          return {
            profileId,
            name: `Profile_${profileId}`,
            platform,
            proxy: null,
            status: ProcessManager.isRunning(profileId) ? 'running' : 'stopped',
            createdAt: null
          };
        }
      }
      return null;
    }

    return {
      ...profileMeta,
      status: ProcessManager.isRunning(profileId) ? 'running' : 'stopped',
      pid: ProcessManager.isRunning(profileId) ? ProcessManager.getProcess(profileId)?.pid : null
    };
  }

  /**
   * Xóa một profile
   * @param {string} profileId - ID của profile
   * @returns {Promise<boolean>} true nếu xóa thành công
   */
  static async delete(profileId) {
    logger.info(`[ProfileService] Deleting profile: ${profileId}`);

    const metadata = this.loadMetadata();
    const profileMeta = metadata.profiles[profileId];
    const platform = profileMeta?.platform || 'win';

    // Xóa folder profile
    const folderPath = path.join(PROFILES_PATH, platform, profileId);

    try {
      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true });
        logger.debug(`[ProfileService] Deleted folder: ${folderPath}`);
      }

      // Xóa khỏi metadata
      delete metadata.profiles[profileId];
      this.saveMetadata(metadata);

      logger.info(`[ProfileService] Profile deleted: ${profileId}`);
      return true;
    } catch (error) {
      logger.error(`[ProfileService] Failed to delete profile ${profileId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cập nhật proxy cho profile
   * @param {string} profileId - ID của profile
   * @param {Object} proxy - Proxy config { mode, host, port, username, password }
   * @returns {Promise<Object>} Updated profile info
   */
  static async updateProxy(profileId, proxy) {
    logger.info(`[ProfileService] Updating proxy for profile: ${profileId}`);

    const metadata = this.loadMetadata();

    if (!metadata.profiles[profileId]) {
      throw new Error(`Profile ${profileId} not found`);
    }

    // Validate proxy
    if (proxy && proxy.mode !== 'none') {
      if (!proxy.host || !proxy.port) {
        throw new Error('Proxy host and port are required');
      }
    }

    metadata.profiles[profileId].proxy = proxy;
    this.saveMetadata(metadata);

    logger.info(`[ProfileService] Proxy updated for profile: ${profileId}`);

    return {
      ...metadata.profiles[profileId],
      status: ProcessManager.isRunning(profileId) ? 'running' : 'stopped'
    };
  }

  /**
   * Cập nhật tên profile
   * @param {string} profileId - ID của profile
   * @param {string} name - Tên mới
   * @returns {Promise<Object>} Updated profile info
   */
  static async updateName(profileId, name) {
    logger.info(`[ProfileService] Updating name for profile: ${profileId} to: ${name}`);

    const metadata = this.loadMetadata();

    if (!metadata.profiles[profileId]) {
      throw new Error(`Profile ${profileId} not found`);
    }

    if (!name || !name.trim()) {
      throw new Error('Profile name is required');
    }

    metadata.profiles[profileId].name = name.trim();
    this.saveMetadata(metadata);

    logger.info(`[ProfileService] Name updated for profile: ${profileId}`);

    return {
      ...metadata.profiles[profileId],
      status: ProcessManager.isRunning(profileId) ? 'running' : 'stopped'
    };
  }

  /**
   * Cập nhật tags cho profile
   * @param {string} profileId - ID của profile
   * @param {Array<string>} tags - Mảng tags
   * @returns {Promise<Object>} Updated profile info
   */
  static async updateTags(profileId, tags) {
    logger.info(`[ProfileService] Updating tags for profile: ${profileId}`);

    const metadata = this.loadMetadata();

    if (!metadata.profiles[profileId]) {
      throw new Error(`Profile ${profileId} not found`);
    }

    // Validate và clean tags
    const cleanTags = Array.isArray(tags)
      ? tags.map(t => t.trim()).filter(t => t.length > 0)
      : [];

    metadata.profiles[profileId].tags = cleanTags;
    this.saveMetadata(metadata);

    logger.info(`[ProfileService] Tags updated for profile: ${profileId}: ${cleanTags.join(', ')}`);

    return {
      ...metadata.profiles[profileId],
      status: ProcessManager.isRunning(profileId) ? 'running' : 'stopped'
    };
  }

  /**
   * Lấy danh sách tất cả tags (từ profiles và settings)
   * @returns {Array<string>} Mảng tags unique
   */
  static getAllTags() {
    const metadata = this.loadMetadata();
    const tagsSet = new Set();

    // Lấy tags từ các profiles
    Object.values(metadata.profiles).forEach(profile => {
      if (profile.tags && Array.isArray(profile.tags)) {
        profile.tags.forEach(tag => tagsSet.add(tag));
      }
    });

    // Lấy tags từ Settings Tag Management
    const settingsTags = SettingsService.getTags();
    settingsTags.forEach(tag => tagsSet.add(tag));

    return Array.from(tagsSet).sort();
  }

  /**
   * Lấy đường dẫn profile (folder)
   * @param {string} profileId - ID của profile
   * @param {string} platform - Platform
   * @returns {string|null} Đường dẫn hoặc null
   */
  static getProfilePath(profileId, platform = 'win') {
    const folderPath = path.join(PROFILES_PATH, platform, profileId);

    if (fs.existsSync(folderPath)) return folderPath;
    return null;
  }
}

module.exports = ProfileService;
