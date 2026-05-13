/**
 * Settings Service - Quản lý cài đặt ứng dụng
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../../logger');
const { getDataPath, getProfilesPath } = require('../utils/paths');
const { safeWriteFileSync, safeLoadJSON } = require('../utils/safeWrite');

// Đường dẫn cơ sở - sử dụng module paths
const SETTINGS_PATH = path.join(getDataPath(), 'settings.json');
const DEFAULT_PROFILES_PATH = getProfilesPath();

// Default settings
const DEFAULT_SETTINGS = {
  profilesFolder: DEFAULT_PROFILES_PATH,
  tags: []
};

class SettingsService {
  /**
   * Load settings từ file (với auto-recovery từ backup)
   * @returns {Object} Settings object
   */
  static loadSettings() {
    const data = safeLoadJSON(SETTINGS_PATH, null);
    if (data) {
      return { ...DEFAULT_SETTINGS, ...data };
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Save settings vào file (atomic write + backup)
   * @param {Object} settings - Settings object
   */
  static saveSettings(settings) {
    safeWriteFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    logger.debug(`[SettingsService] Settings saved`);
  }

  /**
   * Lấy tất cả settings
   * @returns {Object} Settings
   */
  static getAll() {
    return this.loadSettings();
  }

  /**
   * Cập nhật profiles folder
   * @param {string} folderPath - Đường dẫn folder mới
   * @returns {Object} Updated settings
   */
  static setProfilesFolder(folderPath) {
    logger.info(`[SettingsService] Setting profiles folder to: ${folderPath}`);

    // Validate folder exists or can be created
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      logger.info(`[SettingsService] Created folder: ${folderPath}`);
    }

    const settings = this.loadSettings();
    settings.profilesFolder = folderPath;
    this.saveSettings(settings);

    return settings;
  }

  /**
   * Lấy profiles folder hiện tại
   * @returns {string} Folder path
   */
  static getProfilesFolder() {
    const settings = this.loadSettings();
    return settings.profilesFolder || DEFAULT_PROFILES_PATH;
  }

  /**
   * Lấy danh sách tags
   * @returns {Array<string>} Tags
   */
  static getTags() {
    const settings = this.loadSettings();
    return settings.tags || [];
  }

  /**
   * Thêm tag mới
   * @param {string} tag - Tag name
   * @returns {Array<string>} Updated tags
   */
  static addTag(tag) {
    const tagName = tag.trim();
    if (!tagName) {
      throw new Error('Tag name is required');
    }

    logger.info(`[SettingsService] Adding tag: ${tagName}`);

    const settings = this.loadSettings();
    if (!settings.tags) {
      settings.tags = [];
    }

    // Check if tag already exists
    if (settings.tags.includes(tagName)) {
      throw new Error('Tag already exists');
    }

    settings.tags.push(tagName);
    settings.tags.sort();
    this.saveSettings(settings);

    return settings.tags;
  }

  /**
   * Xóa tag
   * @param {string} tag - Tag name
   * @returns {Array<string>} Updated tags
   */
  static deleteTag(tag) {
    logger.info(`[SettingsService] Deleting tag: ${tag}`);

    const settings = this.loadSettings();
    if (!settings.tags) {
      settings.tags = [];
    }

    settings.tags = settings.tags.filter(t => t !== tag);
    this.saveSettings(settings);

    return settings.tags;
  }

  /**
   * Cập nhật tên tag
   * @param {string} oldTag - Tên tag cũ
   * @param {string} newTag - Tên tag mới
   * @returns {Array<string>} Updated tags
   */
  static renameTag(oldTag, newTag) {
    const newTagName = newTag.trim();
    if (!newTagName) {
      throw new Error('New tag name is required');
    }

    logger.info(`[SettingsService] Renaming tag: ${oldTag} -> ${newTagName}`);

    const settings = this.loadSettings();
    if (!settings.tags) {
      settings.tags = [];
    }

    // Check if new tag already exists
    if (settings.tags.includes(newTagName) && newTagName !== oldTag) {
      throw new Error('Tag already exists');
    }

    const index = settings.tags.indexOf(oldTag);
    if (index !== -1) {
      settings.tags[index] = newTagName;
      settings.tags.sort();
      this.saveSettings(settings);
    }

    return settings.tags;
  }
}

module.exports = SettingsService;
