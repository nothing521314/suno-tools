/**
 * PIA Proxy Service - Quản lý PIA S5 Proxy
 * PIA Proxy là SOCKS5 chạy trên 127.0.0.1
 * Port bắt đầu từ 40000
 */

const axios = require('axios');
const logger = require('../../../logger');

// PIA Proxy API Configuration
const PIA_API_PORT = 42333;
const PIA_API_BASE = `http://127.0.0.1:${PIA_API_PORT}/api`;
const PIA_START_PORT = 40000;

// Track assigned ports
let nextPort = PIA_START_PORT;
const assignedPorts = new Map(); // profileId -> port

class PiaProxyService {
  /**
   * Lấy port tiếp theo cho profile mới
   * @param {string} profileId - ID của profile
   * @returns {number} Port number
   */
  static getNextPort(profileId) {
    // Check if profile already has a port
    if (assignedPorts.has(profileId)) {
      return assignedPorts.get(profileId);
    }

    // Assign new port
    const port = nextPort;
    assignedPorts.set(profileId, port);
    nextPort++;

    logger.info(`[PiaProxy] Assigned port ${port} to profile ${profileId}`);
    return port;
  }

  /**
   * Lấy port đã được gán cho profile
   * @param {string} profileId - ID của profile
   * @returns {number|null} Port number hoặc null
   */
  static getAssignedPort(profileId) {
    return assignedPorts.get(profileId) || null;
  }

  /**
   * Order proxy cho profile với quốc gia cụ thể
   * @param {string} profileId - ID của profile
   * @param {string} country - Country code (ISO alpha-2)
   * @param {number} port - Port number (optional, auto-assign if not provided)
   * @returns {Promise<Object>} Result { success, proxy, error }
   */
  static async orderProxy(profileId, country, port = null) {
    try {
      // Get or assign port
      const proxyPort = port || this.getNextPort(profileId);

      // Store port assignment
      if (!assignedPorts.has(profileId)) {
        assignedPorts.set(profileId, proxyPort);
      }

      logger.info(`[PiaProxy] Ordering proxy for profile ${profileId}: country=${country}, port=${proxyPort}`);

      // Use port_ip_list API to assign country to port
      const url = `${PIA_API_BASE}/port_ip_list?ports=${proxyPort}-${country.toUpperCase()}`;

      logger.debug(`[PiaProxy] API Request: ${url}`);

      const response = await axios.get(url, { timeout: 30000 });

      logger.debug(`[PiaProxy] API Response: ${JSON.stringify(response.data)}`);

      // Check response
      if (response.data && response.status === 200) {
        // PIA API returns the IP info
        const proxyInfo = {
          mode: 'socks5',
          host: '127.0.0.1',
          port: proxyPort,
          username: '',
          password: '',
          piaCountry: country.toUpperCase(),
          piaPort: proxyPort,
          orderedAt: new Date().toISOString()
        };

        logger.info(`[PiaProxy] Proxy ordered successfully for profile ${profileId}: socks5://127.0.0.1:${proxyPort}`);

        return {
          success: true,
          proxy: proxyInfo
        };
      }

      // Handle error response
      const errorMsg = response.data?.message || response.data?.error || 'Unknown error';
      logger.error(`[PiaProxy] Order failed: ${errorMsg}`);

      return {
        success: false,
        error: errorMsg
      };

    } catch (error) {
      logger.error(`[PiaProxy] Order proxy error: ${error.message}`);

      // Check if PIA client is running
      if (error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: 'PIA Proxy client is not running. Please start PIA S5 Proxy application.'
        };
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Kiểm tra proxy và order nếu chưa có (lần đầu)
   * @param {string} profileId - ID của profile
   * @param {Object} currentProxy - Current proxy config
   * @returns {Promise<Object>} Result { success, proxy, needsReorder }
   */
  static async checkAndReorderProxy(profileId, currentProxy) {
    // Nếu không phải PIA proxy, return nguyên
    if (!currentProxy || (currentProxy.mode !== 'pia' && currentProxy.mode !== 'socks5') || !currentProxy.piaCountry) {
      return { success: true, proxy: currentProxy, needsReorder: false };
    }

    // Nếu chưa có port (lần đầu order), order proxy mới
    if (!currentProxy.piaPort) {
      logger.info(`[PiaProxy] Profile ${profileId} has no PIA port assigned, ordering new proxy...`);

      const result = await this.orderProxy(profileId, currentProxy.piaCountry);

      if (result.success) {
        return {
          success: true,
          proxy: result.proxy,
          needsReorder: true
        };
      }

      return {
        success: false,
        error: result.error,
        needsReorder: true
      };
    }

    // Đã có port, return proxy hiện tại (sẽ check live khi launch browser)
    logger.debug(`[PiaProxy] Profile ${profileId} already has PIA port ${currentProxy.piaPort}`);
    return { success: true, proxy: currentProxy, needsReorder: false };
  }

  /**
   * Force order lại proxy (khi proxy die)
   * @param {string} profileId - ID của profile
   * @param {Object} currentProxy - Current proxy config
   * @returns {Promise<Object>} Result { success, proxy }
   */
  static async forceReorderProxy(profileId, currentProxy) {
    if (!currentProxy || (currentProxy.mode !== 'pia' && currentProxy.mode !== 'socks5') || !currentProxy.piaCountry) {
      return { success: false, error: 'Not a PIA proxy' };
    }

    logger.info(`[PiaProxy] Proxy die, re-ordering for profile ${profileId} with country ${currentProxy.piaCountry}...`);

    const result = await this.orderProxy(
      profileId,
      currentProxy.piaCountry,
      currentProxy.piaPort
    );

    if (result.success) {
      return {
        success: true,
        proxy: result.proxy
      };
    }

    return {
      success: false,
      error: result.error
    };
  }

  /**
   * Free proxy port
   * @param {number} port - Port number to free
   * @returns {Promise<boolean>} Success
   */
  static async freePort(port) {
    try {
      const url = `${PIA_API_BASE}/port_free?free_port=${port}`;
      await axios.get(url, { timeout: 10000 });
      logger.info(`[PiaProxy] Freed port ${port}`);
      return true;
    } catch (error) {
      logger.error(`[PiaProxy] Free port error: ${error.message}`);
      return false;
    }
  }

  /**
   * Free tất cả ports
   * @returns {Promise<boolean>} Success
   */
  static async freeAllPorts() {
    try {
      const url = `${PIA_API_BASE}/port_free?free_port=all`;
      await axios.get(url, { timeout: 10000 });
      assignedPorts.clear();
      nextPort = PIA_START_PORT;
      logger.info(`[PiaProxy] Freed all ports`);
      return true;
    } catch (error) {
      logger.error(`[PiaProxy] Free all ports error: ${error.message}`);
      return false;
    }
  }

  /**
   * Kiểm tra PIA client có đang chạy không
   * @returns {Promise<boolean>} Is running
   */
  static async isClientRunning() {
    try {
      const url = `${PIA_API_BASE}/get_ip_list?num=1`;
      await axios.get(url, { timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Lấy danh sách quốc gia phổ biến
   * @returns {Array} List of countries with code and name
   */
  static getPopularCountries() {
    return [
      { code: 'US', name: 'United States' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'DE', name: 'Germany' },
      { code: 'FR', name: 'France' },
      { code: 'JP', name: 'Japan' },
      { code: 'KR', name: 'South Korea' },
      { code: 'SG', name: 'Singapore' },
      { code: 'AU', name: 'Australia' },
      { code: 'CA', name: 'Canada' },
      { code: 'NL', name: 'Netherlands' },
      { code: 'IT', name: 'Italy' },
      { code: 'ES', name: 'Spain' },
      { code: 'BR', name: 'Brazil' },
      { code: 'IN', name: 'India' },
      { code: 'RU', name: 'Russia' },
      { code: 'VN', name: 'Vietnam' },
      { code: 'TH', name: 'Thailand' },
      { code: 'ID', name: 'Indonesia' },
      { code: 'MY', name: 'Malaysia' },
      { code: 'PH', name: 'Philippines' },
      { code: 'HK', name: 'Hong Kong' },
      { code: 'TW', name: 'Taiwan' },
      { code: 'MX', name: 'Mexico' },
      { code: 'AR', name: 'Argentina' },
      { code: 'CL', name: 'Chile' },
      { code: 'PL', name: 'Poland' },
      { code: 'SE', name: 'Sweden' },
      { code: 'NO', name: 'Norway' },
      { code: 'FI', name: 'Finland' },
      { code: 'DK', name: 'Denmark' },
      { code: 'CH', name: 'Switzerland' },
      { code: 'AT', name: 'Austria' },
      { code: 'BE', name: 'Belgium' },
      { code: 'PT', name: 'Portugal' },
      { code: 'GR', name: 'Greece' },
      { code: 'TR', name: 'Turkey' },
      { code: 'ZA', name: 'South Africa' },
      { code: 'AE', name: 'United Arab Emirates' },
      { code: 'SA', name: 'Saudi Arabia' },
      { code: 'IL', name: 'Israel' }
    ];
  }
}

module.exports = PiaProxyService;
