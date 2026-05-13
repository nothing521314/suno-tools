/**
 * Process Manager - Quản lý các browser processes đang chạy
 * Lưu trữ và theo dõi các child processes của profiles
 */

const logger = require('../../../logger');
const PortManager = require('./portManager');

// Map lưu trữ: profileId -> { pid, process, startedAt }
const runningProcesses = new Map();

class ProcessManager {
  /**
   * Thêm process mới vào danh sách quản lý
   * @param {string} profileId - ID của profile
   * @param {ChildProcess} childProcess - Process được spawn
   * @param {number|null} debugPort - CDP debug port
   */
  static addProcess(profileId, childProcess, debugPort = null) {
    const processInfo = {
      pid: childProcess.pid,
      process: childProcess,
      startedAt: new Date(),
      debugPort: debugPort || null
    };

    runningProcesses.set(profileId, processInfo);
    logger.info(`[ProcessManager] Added process for profile ${profileId}, PID: ${childProcess.pid}`);

    // Tự động xóa khi process kết thúc
    childProcess.on('close', (code) => {
      logger.info(`[ProcessManager] Process for profile ${profileId} closed with code ${code}`);
      this.removeProcess(profileId);
    });

    childProcess.on('error', (error) => {
      logger.error(`[ProcessManager] Process error for profile ${profileId}: ${error.message}`);
      this.removeProcess(profileId);
    });
  }

  /**
   * Xóa process khỏi danh sách quản lý
   * @param {string} profileId - ID của profile
   */
  static removeProcess(profileId) {
    if (runningProcesses.has(profileId)) {
      runningProcesses.delete(profileId);
      PortManager.release(profileId);
      logger.info(`[ProcessManager] Removed process for profile ${profileId}`);
    }
  }

  /**
   * Lấy thông tin process theo profileId
   * @param {string} profileId - ID của profile
   * @returns {Object|undefined} Thông tin process hoặc undefined
   */
  static getProcess(profileId) {
    return runningProcesses.get(profileId);
  }

  /**
   * Kiểm tra profile có đang chạy không
   * @param {string} profileId - ID của profile
   * @returns {boolean} true nếu đang chạy
   */
  static isRunning(profileId) {
    return runningProcesses.has(profileId);
  }

  /**
   * Lấy debug port của profile
   * @param {string} profileId - ID của profile
   * @returns {number|null} Debug port hoặc null
   */
  static getDebugPort(profileId) {
    const data = runningProcesses.get(profileId);
    return data ? data.debugPort : null;
  }

  /**
   * Lấy danh sách tất cả profiles đang chạy
   * @returns {Array} Mảng các object chứa profileId, pid, startedAt, debugPort
   */
  static getAllRunning() {
    return Array.from(runningProcesses.entries()).map(([id, data]) => ({
      profileId: id,
      pid: data.pid,
      startedAt: data.startedAt,
      debugPort: data.debugPort
    }));
  }

  /**
   * Dừng process của một profile
   * @param {string} profileId - ID của profile
   * @returns {boolean} true nếu kill thành công
   */
  static killProcess(profileId) {
    const data = runningProcesses.get(profileId);
    if (data && data.process) {
      try {
        // Windows sử dụng taskkill, các OS khác dùng SIGTERM
        if (process.platform === 'win32') {
          const { execSync } = require('child_process');
          execSync(`taskkill /pid ${data.pid} /T /F`, { stdio: 'ignore' });
        } else {
          data.process.kill('SIGTERM');
        }
        runningProcesses.delete(profileId);
        logger.info(`[ProcessManager] Killed process for profile ${profileId}`);
        return true;
      } catch (error) {
        logger.error(`[ProcessManager] Failed to kill process for profile ${profileId}: ${error.message}`);
        runningProcesses.delete(profileId);
        return false;
      }
    }
    return false;
  }

  /**
   * Dừng tất cả processes đang chạy
   */
  static killAll() {
    logger.info(`[ProcessManager] Killing all ${runningProcesses.size} running processes...`);
    for (const [profileId] of runningProcesses) {
      this.killProcess(profileId);
    }
    runningProcesses.clear();
    logger.info(`[ProcessManager] All processes killed`);
  }

  /**
   * Lấy số lượng profiles đang chạy
   * @returns {number} Số lượng profiles đang chạy
   */
  static getRunningCount() {
    return runningProcesses.size;
  }
}

module.exports = ProcessManager;
