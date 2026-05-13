/**
 * Preload Script - Bridge giữa main process và renderer
 * Expose API an toàn cho frontend
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose API cho renderer process
contextBridge.exposeInMainWorld('api', {
  // Profile operations
  profiles: {
    /**
     * Lấy danh sách tất cả profiles
     * @returns {Promise<Object>} { success, data: Profile[], count }
     */
    list: () => ipcRenderer.invoke('profiles:list'),

    /**
     * Tạo profile mới
     * @param {Object} data - { name?, platform? }
     * @returns {Promise<Object>} { success, data: Profile }
     */
    create: (data) => ipcRenderer.invoke('profiles:create', data),

    /**
     * Lấy chi tiết profile
     * @param {string} id - Profile ID
     * @returns {Promise<Object>} { success, data: Profile }
     */
    get: (id) => ipcRenderer.invoke('profiles:get', id),

    /**
     * Chạy browser với profile
     * @param {string} id - Profile ID
     * @param {Object} proxy - Proxy config (optional)
     * @returns {Promise<Object>} { success, data: { profileId, pid, status } }
     */
    start: (id, proxy) => ipcRenderer.invoke('profiles:start', id, proxy),

    /**
     * Dừng browser
     * @param {string} id - Profile ID
     * @returns {Promise<Object>} { success, data: { profileId, status } }
     */
    stop: (id) => ipcRenderer.invoke('profiles:stop', id),

    /**
     * Xóa profile
     * @param {string} id - Profile ID
     * @returns {Promise<Object>} { success, message }
     */
    delete: (id) => ipcRenderer.invoke('profiles:delete', id),

    /**
     * Cập nhật proxy cho profile
     * @param {string} id - Profile ID
     * @param {Object} proxy - { mode, host, port, username, password }
     * @returns {Promise<Object>} { success, data: Profile }
     */
    updateProxy: (id, proxy) => ipcRenderer.invoke('profiles:updateProxy', id, proxy),

    /**
     * Cập nhật tên profile
     * @param {string} id - Profile ID
     * @param {string} name - Tên mới
     * @returns {Promise<Object>} { success, data: Profile }
     */
    updateName: (id, name) => ipcRenderer.invoke('profiles:updateName', id, name),

    /**
     * Cập nhật tags cho profile
     * @param {string} id - Profile ID
     * @param {Array<string>} tags - Mảng tags
     * @returns {Promise<Object>} { success, data: Profile }
     */
    updateTags: (id, tags) => ipcRenderer.invoke('profiles:updateTags', id, tags)
  },

  // Tags
  tags: {
    /**
     * Lấy danh sách tất cả tags
     * @returns {Promise<Object>} { success, data: string[] }
     */
    getAll: () => ipcRenderer.invoke('tags:getAll')
  },

  // PIA Proxy
  pia: {
    /**
     * Lấy danh sách countries cho PIA Proxy
     * @returns {Promise<Object>} { success, data: [{ code, name }] }
     */
    getCountries: () => ipcRenderer.invoke('pia:getCountries'),

    /**
     * Kiểm tra PIA client status
     * @returns {Promise<Object>} { success, data: { isRunning, message } }
     */
    getStatus: () => ipcRenderer.invoke('pia:getStatus'),

    /**
     * Order PIA proxy cho profile
     * @param {string} profileId - Profile ID
     * @param {string} country - Country code
     * @returns {Promise<Object>} { success, data: { proxy, message } }
     */
    order: (profileId, country) => ipcRenderer.invoke('pia:order', profileId, country)
  },

  // Settings
  settings: {
    /**
     * Lấy tất cả settings
     * @returns {Promise<Object>} { success, data: Settings }
     */
    getAll: () => ipcRenderer.invoke('settings:getAll'),

    /**
     * Set profiles folder
     * @param {string} folder - Folder path
     * @returns {Promise<Object>} { success, data: Settings }
     */
    setProfilesFolder: (folder) => ipcRenderer.invoke('settings:setProfilesFolder', folder),

    /**
     * Browse for folder
     * @returns {Promise<string|null>} Selected folder path or null
     */
    browseFolder: () => ipcRenderer.invoke('settings:browseFolder'),

    /**
     * Lấy danh sách tags từ settings
     * @returns {Promise<Object>} { success, data: string[] }
     */
    getTags: () => ipcRenderer.invoke('settings:getTags'),

    /**
     * Thêm tag mới
     * @param {string} tag - Tag name
     * @returns {Promise<Object>} { success, data: string[] }
     */
    addTag: (tag) => ipcRenderer.invoke('settings:addTag', tag),

    /**
     * Xóa tag
     * @param {string} tag - Tag name
     * @returns {Promise<Object>} { success, data: string[] }
     */
    deleteTag: (tag) => ipcRenderer.invoke('settings:deleteTag', tag)
  },

  // Status
  status: {
    /**
     * Lấy trạng thái các profiles đang chạy
     * @returns {Promise<Object>} { success, data: { running: [], count } }
     */
    get: () => ipcRenderer.invoke('status:get')
  },

  // Logs
  logs: {
    /**
     * Lấy logs mới từ server
     * @param {string} since - Timestamp để lấy logs sau thời điểm này
     * @returns {Promise<Object>} { success, data: { logs: [], lastTimestamp } }
     */
    get: (since) => ipcRenderer.invoke('logs:get', since)
  },

  // Scripts
  scripts: {
    list: () => ipcRenderer.invoke('scripts:list'),
    get: (id) => ipcRenderer.invoke('scripts:get', id),
    create: (data) => ipcRenderer.invoke('scripts:create', data),
    update: (id, data) => ipcRenderer.invoke('scripts:update', id, data),
    delete: (id) => ipcRenderer.invoke('scripts:delete', id),
    run: (scriptId, profileId) => ipcRenderer.invoke('scripts:run', scriptId, profileId),
    runBatch: (scriptId, profileIds, concurrency) => ipcRenderer.invoke('scripts:runBatch', scriptId, profileIds, concurrency),
    stopExecution: (execId) => ipcRenderer.invoke('scripts:stopExecution', execId),
    getExecutions: () => ipcRenderer.invoke('scripts:getExecutions'),
    getExecutionLogs: (execId) => ipcRenderer.invoke('scripts:getExecutionLogs', execId),
    importScript: (filePath, name) => ipcRenderer.invoke('scripts:import', filePath, name),
    browseImport: () => ipcRenderer.invoke('scripts:browseImport'),
    startRecording: (profileId) => ipcRenderer.invoke('scripts:startRecording', profileId),
    stopRecording: (profileId) => ipcRenderer.invoke('scripts:stopRecording', profileId),
    getRecordingStatus: (profileId) => ipcRenderer.invoke('scripts:getRecordingStatus', profileId),
    startPicker: (profileId) => ipcRenderer.invoke('scripts:startPicker', profileId),
    cancelPicker: (profileId) => ipcRenderer.invoke('scripts:cancelPicker', profileId)
  },

  // Dialogs
  dialog: {
    /**
     * Hiển thị confirm dialog
     * @param {string} message - Nội dung
     * @returns {Promise<boolean>} true nếu user chọn OK
     */
    confirm: (message) => ipcRenderer.invoke('dialog:confirm', message),

    /**
     * Hiển thị error dialog
     * @param {string} message - Nội dung lỗi
     */
    error: (message) => ipcRenderer.invoke('dialog:error', message)
  }
});

console.log('[Preload] API exposed to renderer');
