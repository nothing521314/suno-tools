/**
 * Safe Write Utilities - Ghi file an toàn chống mất điện / crash
 *
 * Sử dụng kỹ thuật:
 * 1. Atomic write: ghi vào file .tmp → fsync → rename (thay thế file gốc)
 * 2. Auto backup: tạo .bak trước khi ghi đè
 * 3. Auto recovery: nếu file gốc hỏng → tự khôi phục từ .bak
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../../logger');

/**
 * Ghi file an toàn (atomic write + backup)
 *
 * Quy trình:
 * 1. Ghi dữ liệu vào file .tmp
 * 2. fsync để đảm bảo dữ liệu đã xuống đĩa
 * 3. Backup file cũ thành .bak
 * 4. Rename .tmp → file gốc (atomic trên NTFS)
 *
 * @param {string} filePath - Đường dẫn file cần ghi
 * @param {string} data - Nội dung cần ghi
 */
function safeWriteFileSync(filePath, data) {
  const tmpPath = filePath + '.tmp';
  const bakPath = filePath + '.bak';

  try {
    // Đảm bảo thư mục tồn tại
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Bước 1: Ghi vào file tạm
    fs.writeFileSync(tmpPath, data, 'utf8');

    // Bước 2: Flush xuống đĩa (đảm bảo không nằm trong buffer)
    const fd = fs.openSync(tmpPath, 'r+');
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    // Bước 3: Backup file cũ (nếu có)
    if (fs.existsSync(filePath)) {
      try {
        fs.copyFileSync(filePath, bakPath);
      } catch (bakErr) {
        logger.warn(`[SafeWrite] Không thể tạo backup ${bakPath}: ${bakErr.message}`);
      }
    }

    // Bước 4: Atomic rename - thay thế file gốc
    fs.renameSync(tmpPath, filePath);

    logger.debug(`[SafeWrite] Đã ghi an toàn: ${path.basename(filePath)}`);
  } catch (error) {
    // Dọn file tạm nếu còn
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}

    logger.error(`[SafeWrite] Lỗi ghi file ${filePath}: ${error.message}`);
    throw error;
  }
}

/**
 * Đọc file JSON an toàn với auto-recovery từ backup
 *
 * Quy trình:
 * 1. Đọc file gốc → JSON.parse
 * 2. Nếu file hỏng → thử khôi phục từ .bak
 * 3. Nếu .bak cũng hỏng → trả về defaultValue
 *
 * @param {string} filePath - Đường dẫn file JSON
 * @param {*} defaultValue - Giá trị mặc định nếu không đọc được
 * @returns {*} Dữ liệu đã parse hoặc defaultValue
 */
function safeLoadJSON(filePath, defaultValue = null) {
  const bakPath = filePath + '.bak';

  // Thử đọc file gốc
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.trim().length > 0) {
        return JSON.parse(content);
      }
      logger.warn(`[SafeWrite] File rỗng: ${path.basename(filePath)}`);
    } catch (error) {
      logger.error(`[SafeWrite] File gốc bị hỏng: ${path.basename(filePath)} - ${error.message}`);
    }
  }

  // File gốc hỏng hoặc không tồn tại → thử backup
  if (fs.existsSync(bakPath)) {
    try {
      const bakContent = fs.readFileSync(bakPath, 'utf8');
      if (bakContent.trim().length > 0) {
        const data = JSON.parse(bakContent);

        // Khôi phục: ghi lại file gốc từ backup
        try {
          fs.writeFileSync(filePath, bakContent, 'utf8');
          logger.info(`[SafeWrite] Đã khôi phục ${path.basename(filePath)} từ backup!`);
        } catch (_) {}

        return data;
      }
    } catch (bakError) {
      logger.error(`[SafeWrite] Backup cũng bị hỏng: ${path.basename(bakPath)} - ${bakError.message}`);
    }
  }

  // Cả hai đều hỏng → trả về default
  if (fs.existsSync(filePath) || fs.existsSync(bakPath)) {
    logger.error(`[SafeWrite] CẢNH BÁO: Không thể đọc ${path.basename(filePath)} và backup. Dùng dữ liệu mặc định.`);
  }

  return defaultValue;
}

module.exports = {
  safeWriteFileSync,
  safeLoadJSON
};
