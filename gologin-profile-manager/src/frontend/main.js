/**
 * Electron Main Process - Entry point cho desktop app
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Logger
const logger = require('../../logger');

// API base URL - dùng 127.0.0.1 thay vì localhost để tránh delay DNS/IPv6
const API_BASE = 'http://127.0.0.1:3000/api/v1';

// Biến global
let mainWindow = null;
let apiServer = null;

/**
 * Tạo cửa sổ chính
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'GoLogin Profile Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    show: false
  });

  // Load HTML
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Hiển thị khi ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    logger.info('[Electron] Main window shown');
  });

  // DevTools - chỉ mở khi nhấn F12 thủ công
  // if (process.env.NODE_ENV !== 'production') {
  //   mainWindow.webContents.openDevTools();
  // }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  logger.info('[Electron] Main window created');
}

/**
 * Khởi động API server như child process
 */
function startApiServer() {
  const serverPath = path.join(__dirname, '..', 'backend', 'server.js');

  // Xác định đường dẫn gốc để truyền cho API server
  let appBasePath;
  if (app.isPackaged) {
    // Production: thư mục chứa exe
    appBasePath = path.dirname(app.getPath('exe'));
  } else {
    // Development: thư mục project
    appBasePath = path.resolve(__dirname, '..', '..');
  }

  logger.info(`[Electron] Starting API server: ${serverPath}`);
  logger.info(`[Electron] App base path: ${appBasePath}`);

  apiServer = spawn(process.execPath, [serverPath], {
    cwd: appBasePath,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      APP_BASE_PATH: appBasePath,
      APP_RESOURCES_PATH: appBasePath // Dùng appBasePath cho standalone build
    }
  });

  apiServer.stdout.on('data', (data) => {
    logger.info(`[API] ${data.toString().trim()}`);
  });

  apiServer.stderr.on('data', (data) => {
    logger.error(`[API] ${data.toString().trim()}`);
  });

  apiServer.on('close', (code) => {
    logger.info(`[Electron] API server exited with code ${code}`);
  });

  // Đợi server khởi động bằng cách polling health endpoint
  return new Promise((resolve) => {
    const maxAttempts = 30; // 30 lần * 500ms = 15 giây tối đa
    let attempts = 0;

    const checkServer = async () => {
      attempts++;
      try {
        const http = require('http');
        const req = http.get('http://127.0.0.1:3000/api/v1/health', (res) => {
          if (res.statusCode === 200) {
            logger.info('[Electron] API server is ready');
            resolve();
          } else {
            retry();
          }
        });
        req.on('error', () => retry());
        req.setTimeout(1000, () => {
          req.destroy();
          retry();
        });
      } catch (e) {
        retry();
      }
    };

    const retry = () => {
      if (attempts < maxAttempts) {
        setTimeout(checkServer, 500);
      } else {
        logger.warn('[Electron] API server not responding, continuing anyway...');
        resolve();
      }
    };

    // Đợi 1 giây trước khi bắt đầu check
    setTimeout(checkServer, 1000);
  });
}

/**
 * Dừng API server
 */
function stopApiServer() {
  if (apiServer) {
    logger.info('[Electron] Stopping API server...');

    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', apiServer.pid, '/T', '/F'], { shell: true, windowsHide: true });
    } else {
      apiServer.kill('SIGTERM');
    }

    apiServer = null;
  }
}

// App events
app.whenReady().then(async () => {
  logger.info('[Electron] App ready');

  // Khởi động API server
  await startApiServer();

  // Tạo window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopApiServer();
});

// IPC Handlers - Giao tiếp với renderer process
const axios = require('axios');

// List profiles
ipcMain.handle('profiles:list', async () => {
  try {
    const response = await axios.get(`${API_BASE}/profiles`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] profiles:list error: ${error.message}`);
    throw error;
  }
});

// Create profile
ipcMain.handle('profiles:create', async (event, data) => {
  try {
    const response = await axios.post(`${API_BASE}/profiles`, data);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] profiles:create error: ${error.message}`);
    throw error;
  }
});

// Get profile
ipcMain.handle('profiles:get', async (event, id) => {
  try {
    const response = await axios.get(`${API_BASE}/profiles/${id}`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] profiles:get error: ${error.message}`);
    throw error;
  }
});

// Start profile
ipcMain.handle('profiles:start', async (event, id, proxy) => {
  try {
    const response = await axios.post(`${API_BASE}/profiles/${id}/start`, { proxy });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] profiles:start error: ${error.message}`);
    throw error;
  }
});

// Stop profile
ipcMain.handle('profiles:stop', async (event, id) => {
  try {
    const response = await axios.post(`${API_BASE}/profiles/${id}/stop`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] profiles:stop error: ${error.message}`);
    throw error;
  }
});

// Delete profile
ipcMain.handle('profiles:delete', async (event, id) => {
  try {
    const response = await axios.delete(`${API_BASE}/profiles/${id}`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] profiles:delete error: ${error.message}`);
    throw error;
  }
});

// Update proxy
ipcMain.handle('profiles:updateProxy', async (event, id, proxy) => {
  try {
    const response = await axios.put(`${API_BASE}/profiles/${id}/proxy`, proxy);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] profiles:updateProxy error: ${error.message}`);
    throw error;
  }
});

// Update name
ipcMain.handle('profiles:updateName', async (event, id, name) => {
  try {
    const response = await axios.put(`${API_BASE}/profiles/${id}/name`, { name });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] profiles:updateName error: ${error.message}`);
    throw error;
  }
});

// Update tags
ipcMain.handle('profiles:updateTags', async (event, id, tags) => {
  try {
    const response = await axios.put(`${API_BASE}/profiles/${id}/tags`, { tags });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] profiles:updateTags error: ${error.message}`);
    throw error;
  }
});

// Get all tags
ipcMain.handle('tags:getAll', async () => {
  try {
    const response = await axios.get(`${API_BASE}/tags`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] tags:getAll error: ${error.message}`);
    throw error;
  }
});

// PIA Proxy - Get countries
ipcMain.handle('pia:getCountries', async () => {
  try {
    const response = await axios.get(`${API_BASE}/pia/countries`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] pia:getCountries error: ${error.message}`);
    throw error;
  }
});

// PIA Proxy - Get status
ipcMain.handle('pia:getStatus', async () => {
  try {
    const response = await axios.get(`${API_BASE}/pia/status`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] pia:getStatus error: ${error.message}`);
    throw error;
  }
});

// PIA Proxy - Order proxy
ipcMain.handle('pia:order', async (event, profileId, country) => {
  try {
    const response = await axios.post(`${API_BASE}/pia/order`, { profileId, country });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] pia:order error: ${error.message}`);
    throw error;
  }
});

// Get status
ipcMain.handle('status:get', async () => {
  try {
    const response = await axios.get(`${API_BASE}/status`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] status:get error: ${error.message}`);
    throw error;
  }
});

// Get logs
ipcMain.handle('logs:get', async (event, since) => {
  try {
    const url = since ? `${API_BASE}/logs?since=${since}` : `${API_BASE}/logs`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    // Silently fail for logs
    return { success: true, data: { logs: [], lastTimestamp: null } };
  }
});

// Show confirm dialog
ipcMain.handle('dialog:confirm', async (event, message) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Cancel', 'OK'],
    defaultId: 1,
    title: 'Confirm',
    message: message
  });
  return result.response === 1;
});

// Show error dialog
ipcMain.handle('dialog:error', async (event, message) => {
  await dialog.showMessageBox(mainWindow, {
    type: 'error',
    buttons: ['OK'],
    title: 'Error',
    message: message
  });
});

// Settings - Get all
ipcMain.handle('settings:getAll', async () => {
  try {
    const response = await axios.get(`${API_BASE}/settings`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] settings:getAll error: ${error.message}`);
    throw error;
  }
});

// Settings - Set profiles folder
ipcMain.handle('settings:setProfilesFolder', async (event, folder) => {
  try {
    const response = await axios.put(`${API_BASE}/settings/profiles-folder`, { folder });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] settings:setProfilesFolder error: ${error.message}`);
    throw error;
  }
});

// Settings - Browse folder
ipcMain.handle('settings:browseFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Profiles Folder'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Settings - Get tags
ipcMain.handle('settings:getTags', async () => {
  try {
    const response = await axios.get(`${API_BASE}/settings/tags`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] settings:getTags error: ${error.message}`);
    throw error;
  }
});

// Settings - Add tag
ipcMain.handle('settings:addTag', async (event, tag) => {
  try {
    const response = await axios.post(`${API_BASE}/settings/tags`, { tag });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] settings:addTag error: ${error.message}`);
    throw error;
  }
});

// Settings - Delete tag
ipcMain.handle('settings:deleteTag', async (event, tag) => {
  try {
    const response = await axios.delete(`${API_BASE}/settings/tags/${encodeURIComponent(tag)}`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] settings:deleteTag error: ${error.message}`);
    throw error;
  }
});

// ============================================
// Scripts IPC Handlers
// ============================================

ipcMain.handle('scripts:list', async () => {
  try {
    const response = await axios.get(`${API_BASE}/scripts`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:list error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('scripts:get', async (event, id) => {
  try {
    const response = await axios.get(`${API_BASE}/scripts/${id}`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:get error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('scripts:create', async (event, data) => {
  try {
    const response = await axios.post(`${API_BASE}/scripts`, data);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:create error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('scripts:update', async (event, id, data) => {
  try {
    const response = await axios.put(`${API_BASE}/scripts/${id}`, data);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:update error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('scripts:delete', async (event, id) => {
  try {
    const response = await axios.delete(`${API_BASE}/scripts/${id}`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:delete error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('scripts:run', async (event, scriptId, profileId) => {
  try {
    const response = await axios.post(`${API_BASE}/scripts/${scriptId}/run`, { profileId });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:run error: ${error.message}`);
    return { success: false, error: error.response?.data?.error || error.message };
  }
});

ipcMain.handle('scripts:runBatch', async (event, scriptId, profileIds, concurrency) => {
  try {
    const response = await axios.post(`${API_BASE}/scripts/${scriptId}/run-batch`, { profileIds, concurrency });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:runBatch error: ${error.message}`);
    return { success: false, error: error.response?.data?.error || error.message };
  }
});

ipcMain.handle('scripts:stopExecution', async (event, execId) => {
  try {
    const response = await axios.post(`${API_BASE}/scripts/executions/${execId}/stop`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:stopExecution error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('scripts:getExecutions', async () => {
  try {
    const response = await axios.get(`${API_BASE}/scripts/executions`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:getExecutions error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('scripts:getExecutionLogs', async (event, execId) => {
  try {
    const response = await axios.get(`${API_BASE}/scripts/executions/${execId}/logs`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:getExecutionLogs error: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('scripts:import', async (event, filePath, name) => {
  try {
    const response = await axios.post(`${API_BASE}/scripts/import`, { filePath, name });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:import error: ${error.message}`);
    return { success: false, error: error.response?.data?.error || error.message };
  }
});

ipcMain.handle('scripts:browseImport', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JavaScript', extensions: ['js'] }],
    title: 'Import Script File'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Recording IPC handlers
ipcMain.handle('scripts:startRecording', async (event, profileId) => {
  try {
    const response = await axios.post(`${API_BASE}/scripts/recording/start`, { profileId });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:startRecording error: ${error.message}`);
    return { success: false, error: error.response?.data?.error || error.message };
  }
});

ipcMain.handle('scripts:stopRecording', async (event, profileId) => {
  try {
    const response = await axios.post(`${API_BASE}/scripts/recording/stop`, { profileId });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:stopRecording error: ${error.message}`);
    return { success: false, error: error.response?.data?.error || error.message };
  }
});

ipcMain.handle('scripts:getRecordingStatus', async (event, profileId) => {
  try {
    const response = await axios.get(`${API_BASE}/scripts/recording/status/${profileId}`);
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:getRecordingStatus error: ${error.message}`);
    return { success: false, error: error.response?.data?.error || error.message };
  }
});

// Selector Picker IPC
ipcMain.handle('scripts:startPicker', async (event, profileId) => {
  try {
    const response = await axios.post(`${API_BASE}/scripts/picker/start`, { profileId }, { timeout: 65000 });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:startPicker error: ${error.message}`);
    return { success: false, error: error.response?.data?.error || error.message };
  }
});

ipcMain.handle('scripts:cancelPicker', async (event, profileId) => {
  try {
    const response = await axios.post(`${API_BASE}/scripts/picker/cancel`, { profileId });
    return response.data;
  } catch (error) {
    logger.error(`[IPC] scripts:cancelPicker error: ${error.message}`);
    return { success: false, error: error.response?.data?.error || error.message };
  }
});

logger.info('[Electron] Main process initialized');
