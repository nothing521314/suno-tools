/**
 * Script Execution Service - Chạy automation scripts với Puppeteer
 * Kết nối vào browser qua CDP, thực thi script, quản lý lifecycle
 */

const puppeteer = require('puppeteer-core');
const logger = require('../../../logger');
const ProcessManager = require('../utils/processManager');
const PortManager = require('../utils/portManager');
const ScriptService = require('./scriptService');

// Lưu trữ executions đang chạy
const executions = new Map(); // execId -> { id, scriptId, profileId, status, logs, startedAt, browser, page }

/**
 * Tạo execution ID
 */
function generateExecId() {
  return 'exec_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

class ScriptExecutionService {
  /**
   * Chạy script trên 1 profile
   * @param {string} scriptId - ID của script
   * @param {string} profileId - ID của profile đang chạy
   * @returns {Object} Execution info
   */
  static async run(scriptId, profileId) {
    // Validate script
    const script = ScriptService.getById(scriptId);
    if (!script) {
      throw new Error(`Script ${scriptId} not found`);
    }

    // Validate profile đang chạy
    if (!ProcessManager.isRunning(profileId)) {
      throw new Error(`Profile ${profileId} is not running. Start the browser first.`);
    }

    const debugPort = ProcessManager.getDebugPort(profileId);
    if (!debugPort) {
      throw new Error(`Profile ${profileId} has no debug port. Restart the browser.`);
    }

    const execId = generateExecId();
    const execution = {
      id: execId,
      scriptId,
      scriptName: script.name,
      profileId,
      status: 'running',
      logs: [],
      startedAt: new Date().toISOString(),
      endedAt: null,
      error: null,
      _browser: null,
      _page: null
    };

    executions.set(execId, execution);
    logger.info(`[ScriptExec] Starting execution ${execId}: script=${scriptId}, profile=${profileId}, port=${debugPort}`);

    // Chạy async - không block response
    this._executeScript(execId, script.code, debugPort).catch(err => {
      logger.error(`[ScriptExec] Execution ${execId} fatal error: ${err.message}`);
    });

    return {
      id: execId,
      scriptId,
      scriptName: script.name,
      profileId,
      status: 'running',
      startedAt: execution.startedAt
    };
  }

  /**
   * Chạy script trên nhiều profiles
   * @param {string} scriptId
   * @param {string[]} profileIds
   * @param {number} concurrency - Số lượng chạy song song (default 3)
   * @returns {Array} Execution infos
   */
  static async runBatch(scriptId, profileIds, concurrency = 3) {
    const results = [];

    // Chia thành các batch theo concurrency
    for (let i = 0; i < profileIds.length; i += concurrency) {
      const batch = profileIds.slice(i, i + concurrency);
      const batchPromises = batch.map(async (profileId) => {
        try {
          const result = await this.run(scriptId, profileId);
          results.push(result);
        } catch (error) {
          results.push({
            profileId,
            status: 'error',
            error: error.message
          });
        }
      });
      await Promise.all(batchPromises);
    }

    return results;
  }

  /**
   * Dừng execution đang chạy
   * @param {string} execId
   * @returns {boolean}
   */
  static async stop(execId) {
    const execution = executions.get(execId);
    if (!execution) return false;

    if (execution.status !== 'running') return false;

    try {
      // Disconnect browser (không close - browser vẫn chạy)
      if (execution._browser) {
        execution._browser.disconnect();
      }
    } catch (e) {
      // Ignore disconnect errors
    }

    execution.status = 'stopped';
    execution.endedAt = new Date().toISOString();
    execution.logs.push({ time: new Date().toISOString(), level: 'warn', message: 'Execution stopped by user' });

    logger.info(`[ScriptExec] Execution ${execId} stopped by user`);
    return true;
  }

  /**
   * Lấy danh sách tất cả executions
   * @returns {Array}
   */
  static getExecutions() {
    return Array.from(executions.values()).map(e => ({
      id: e.id,
      scriptId: e.scriptId,
      scriptName: e.scriptName,
      profileId: e.profileId,
      status: e.status,
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      error: e.error,
      logCount: e.logs.length
    })).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }

  /**
   * Lấy logs của execution
   * @param {string} execId
   * @returns {Array|null}
   */
  static getLogs(execId) {
    const execution = executions.get(execId);
    if (!execution) return null;
    return execution.logs;
  }

  /**
   * Thực thi script (internal)
   */
  static async _executeScript(execId, code, debugPort) {
    const execution = executions.get(execId);
    if (!execution) return;

    const addLog = (level, message) => {
      const entry = { time: new Date().toISOString(), level, message: String(message) };
      execution.logs.push(entry);
      logger.info(`[ScriptExec:${execId}] [${level}] ${message}`);
    };

    let browser = null;

    try {
      addLog('info', `Connecting to browser on port ${debugPort}...`);

      // Kết nối vào browser qua CDP
      browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${debugPort}`,
        defaultViewport: null
      });

      execution._browser = browser;
      addLog('info', 'Connected to browser');

      // Lấy tất cả pages và dọn tab cũ từ phiên trước
      const pages = await browser.pages();
      let page;

      if (pages.length > 1) {
        // Tạo tab mới sạch, đóng tất cả tab cũ
        page = await browser.newPage();
        addLog('info', `Closing ${pages.length} old tab(s) from previous session`);
        for (const oldPage of pages) {
          try { await oldPage.close(); } catch (e) { /* ignore */ }
        }
      } else if (pages.length === 1) {
        // Chỉ 1 tab — nếu URL không phải blank/empty thì tạo tab mới và đóng tab cũ
        const existingUrl = pages[0].url();
        if (existingUrl && existingUrl !== 'about:blank' && existingUrl !== 'chrome://newtab/' && !existingUrl.startsWith('chrome://')) {
          page = await browser.newPage();
          addLog('info', `Closing 1 old tab (${existingUrl.slice(0, 60)})`);
          try { await pages[0].close(); } catch (e) { /* ignore */ }
        } else {
          page = pages[0];
        }
      } else {
        page = await browser.newPage();
      }

      execution._page = page;

      addLog('info', 'Got browser page, executing script...');

      // Tạo logger cho script
      const scriptLogger = {
        info: (msg) => addLog('info', msg),
        warn: (msg) => addLog('warn', msg),
        error: (msg) => addLog('error', msg),
        log: (msg) => addLog('info', msg)
      };

      // Tạo sleep helper
      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      // Wrap và thực thi script code
      const wrappedCode = `
        (async function(page, browser, logger, sleep) {
          ${code}
        })
      `;

      const scriptFn = eval(wrappedCode);
      await scriptFn(page, browser, scriptLogger, sleep);

      // Kiểm tra nếu bị stop giữa chừng
      if (execution.status === 'stopped') return;

      execution.status = 'completed';
      execution.endedAt = new Date().toISOString();
      addLog('info', 'Script completed successfully');

    } catch (error) {
      if (execution.status === 'stopped') return;

      execution.status = 'error';
      execution.endedAt = new Date().toISOString();
      execution.error = error.message;
      addLog('error', `Script error: ${error.message}`);
    } finally {
      // Disconnect (không close browser)
      try {
        if (browser) {
          browser.disconnect();
        }
      } catch (e) {
        // Ignore
      }
      execution._browser = null;
      execution._page = null;
    }
  }

  /**
   * Cleanup tất cả executions cũ
   */
  static cleanup() {
    for (const [execId, execution] of executions) {
      if (execution.status !== 'running') {
        executions.delete(execId);
      }
    }
  }
}

module.exports = ScriptExecutionService;
