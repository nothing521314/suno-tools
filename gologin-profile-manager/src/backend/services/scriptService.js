/**
 * Script Service - CRUD operations cho automation scripts
 * Lưu scripts dưới dạng JSON metadata + nội dung code
 */

const fs = require('fs');
const path = require('path');
const { getDataPath } = require('../utils/paths');
const logger = require('../../../logger');
const { safeWriteFileSync, safeLoadJSON } = require('../utils/safeWrite');

const SCRIPTS_DIR = path.join(getDataPath(), 'automation-scripts');
const SCRIPTS_META_FILE = path.join(SCRIPTS_DIR, 'scripts.json');

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(SCRIPTS_DIR)) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

/**
 * Load metadata từ file (với auto-recovery từ backup)
 */
function loadMeta() {
  return safeLoadJSON(SCRIPTS_META_FILE, { scripts: {} });
}

/**
 * Save metadata ra file (atomic write + backup)
 */
function saveMeta(meta) {
  safeWriteFileSync(SCRIPTS_META_FILE, JSON.stringify(meta, null, 2));
}

/**
 * Tạo unique ID
 */
function generateId() {
  return 'script_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

class ScriptService {
  /**
   * Tạo script mới
   * @param {Object} data - { name, code, description? }
   * @returns {Object} Script metadata
   */
  static create(data) {
    const id = generateId();
    const now = new Date().toISOString();

    const script = {
      id,
      name: data.name || 'Untitled Script',
      description: data.description || '',
      createdAt: now,
      updatedAt: now
    };

    // Lưu code vào file riêng
    const codeFile = path.join(SCRIPTS_DIR, `${id}.js`);
    fs.writeFileSync(codeFile, data.code || '// Write your automation script here\n');

    // Lưu metadata
    const meta = loadMeta();
    meta.scripts[id] = script;
    saveMeta(meta);

    logger.info(`[ScriptService] Created script: ${id} - ${script.name}`);
    return { ...script, code: data.code || '// Write your automation script here\n' };
  }

  /**
   * Lấy danh sách tất cả scripts
   * @returns {Array} Scripts list
   */
  static listAll() {
    const meta = loadMeta();
    return Object.values(meta.scripts).sort((a, b) =>
      new Date(b.updatedAt) - new Date(a.updatedAt)
    );
  }

  /**
   * Lấy script theo ID (bao gồm code)
   * @param {string} id
   * @returns {Object|null}
   */
  static getById(id) {
    const meta = loadMeta();
    const script = meta.scripts[id];
    if (!script) return null;

    const codeFile = path.join(SCRIPTS_DIR, `${id}.js`);
    let code = '';
    if (fs.existsSync(codeFile)) {
      code = fs.readFileSync(codeFile, 'utf8');
    }

    return { ...script, code };
  }

  /**
   * Cập nhật script
   * @param {string} id
   * @param {Object} data - { name?, code?, description? }
   * @returns {Object|null}
   */
  static update(id, data) {
    const meta = loadMeta();
    const script = meta.scripts[id];
    if (!script) return null;

    if (data.name !== undefined) script.name = data.name;
    if (data.description !== undefined) script.description = data.description;
    script.updatedAt = new Date().toISOString();

    if (data.code !== undefined) {
      const codeFile = path.join(SCRIPTS_DIR, `${id}.js`);
      fs.writeFileSync(codeFile, data.code);
    }

    meta.scripts[id] = script;
    saveMeta(meta);

    logger.info(`[ScriptService] Updated script: ${id}`);
    return this.getById(id);
  }

  /**
   * Xóa script
   * @param {string} id
   * @returns {boolean}
   */
  static delete(id) {
    const meta = loadMeta();
    if (!meta.scripts[id]) return false;

    // Xóa code file
    const codeFile = path.join(SCRIPTS_DIR, `${id}.js`);
    if (fs.existsSync(codeFile)) {
      fs.unlinkSync(codeFile);
    }

    delete meta.scripts[id];
    saveMeta(meta);

    logger.info(`[ScriptService] Deleted script: ${id}`);
    return true;
  }

  /**
   * Import script từ file
   * @param {string} filePath - Đường dẫn file .js
   * @param {string} name - Tên script
   * @returns {Object}
   */
  static importFromFile(filePath, name) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const code = fs.readFileSync(filePath, 'utf8');
    const scriptName = name || path.basename(filePath, '.js');

    return this.create({ name: scriptName, code });
  }
}

module.exports = ScriptService;
