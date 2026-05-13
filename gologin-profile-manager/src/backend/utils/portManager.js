/**
 * Port Manager - Quản lý CDP debugging ports cho browser profiles
 * Tránh trùng port giữa các profile chạy đồng thời
 */

const logger = require('../../../logger');

class PortManager {
  static BASE_PORT = 9200;
  static MAX_PORT = 9399;
  static usedPorts = new Map(); // profileId -> port

  /**
   * Cấp phát port cho profile
   * @param {string} profileId
   * @returns {number} Port number
   */
  static allocate(profileId) {
    // Nếu profile đã có port, trả về port cũ
    if (this.usedPorts.has(profileId)) {
      return this.usedPorts.get(profileId);
    }

    const usedPortValues = new Set(this.usedPorts.values());

    for (let port = this.BASE_PORT; port <= this.MAX_PORT; port++) {
      if (!usedPortValues.has(port)) {
        this.usedPorts.set(profileId, port);
        logger.info(`[PortManager] Allocated port ${port} for profile ${profileId}`);
        return port;
      }
    }

    throw new Error('No available CDP ports. Maximum concurrent profiles reached.');
  }

  /**
   * Giải phóng port của profile
   * @param {string} profileId
   */
  static release(profileId) {
    if (this.usedPorts.has(profileId)) {
      const port = this.usedPorts.get(profileId);
      this.usedPorts.delete(profileId);
      logger.info(`[PortManager] Released port ${port} for profile ${profileId}`);
    }
  }

  /**
   * Lấy port của profile
   * @param {string} profileId
   * @returns {number|null}
   */
  static getPort(profileId) {
    return this.usedPorts.get(profileId) || null;
  }

  /**
   * Giải phóng tất cả ports
   */
  static releaseAll() {
    this.usedPorts.clear();
    logger.info('[PortManager] Released all ports');
  }
}

module.exports = PortManager;
