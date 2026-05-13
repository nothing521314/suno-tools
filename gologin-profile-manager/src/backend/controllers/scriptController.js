/**
 * Script Controller - HTTP handlers cho script API
 */

const ScriptService = require('../services/scriptService');
const ScriptExecutionService = require('../services/scriptExecutionService');
const RecordingService = require('../services/recordingService');
const SelectorPickerService = require('../services/selectorPickerService');
const logger = require('../../../logger');

/**
 * Tạo script mới
 * POST /api/v1/scripts
 */
exports.createScript = async (req, res, next) => {
  try {
    const { name, code, description } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Script name is required' });
    }

    const script = ScriptService.create({ name, code, description });
    res.status(201).json({ success: true, data: script });
  } catch (error) {
    logger.error(`[API] Create script error: ${error.message}`);
    next(error);
  }
};

/**
 * Lấy danh sách scripts
 * GET /api/v1/scripts
 */
exports.listScripts = async (req, res, next) => {
  try {
    const scripts = ScriptService.listAll();
    res.json({ success: true, data: scripts, count: scripts.length });
  } catch (error) {
    logger.error(`[API] List scripts error: ${error.message}`);
    next(error);
  }
};

/**
 * Lấy chi tiết script
 * GET /api/v1/scripts/:id
 */
exports.getScript = async (req, res, next) => {
  try {
    const script = ScriptService.getById(req.params.id);
    if (!script) {
      return res.status(404).json({ success: false, error: 'Script not found' });
    }
    res.json({ success: true, data: script });
  } catch (error) {
    logger.error(`[API] Get script error: ${error.message}`);
    next(error);
  }
};

/**
 * Cập nhật script
 * PUT /api/v1/scripts/:id
 */
exports.updateScript = async (req, res, next) => {
  try {
    const { name, code, description } = req.body;
    const script = ScriptService.update(req.params.id, { name, code, description });
    if (!script) {
      return res.status(404).json({ success: false, error: 'Script not found' });
    }
    res.json({ success: true, data: script });
  } catch (error) {
    logger.error(`[API] Update script error: ${error.message}`);
    next(error);
  }
};

/**
 * Xóa script
 * DELETE /api/v1/scripts/:id
 */
exports.deleteScript = async (req, res, next) => {
  try {
    const deleted = ScriptService.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Script not found' });
    }
    res.json({ success: true, message: 'Script deleted' });
  } catch (error) {
    logger.error(`[API] Delete script error: ${error.message}`);
    next(error);
  }
};

/**
 * Chạy script trên 1 profile
 * POST /api/v1/scripts/:id/run
 */
exports.runScript = async (req, res, next) => {
  try {
    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ success: false, error: 'profileId is required' });
    }

    const result = await ScriptExecutionService.run(req.params.id, profileId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`[API] Run script error: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * Chạy script trên nhiều profiles
 * POST /api/v1/scripts/:id/run-batch
 */
exports.runBatch = async (req, res, next) => {
  try {
    const { profileIds, concurrency } = req.body;
    if (!profileIds || !Array.isArray(profileIds) || profileIds.length === 0) {
      return res.status(400).json({ success: false, error: 'profileIds array is required' });
    }

    const results = await ScriptExecutionService.runBatch(
      req.params.id,
      profileIds,
      concurrency || 3
    );
    res.json({ success: true, data: results });
  } catch (error) {
    logger.error(`[API] Run batch error: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * Dừng execution
 * POST /api/v1/scripts/executions/:execId/stop
 */
exports.stopExecution = async (req, res, next) => {
  try {
    const stopped = await ScriptExecutionService.stop(req.params.execId);
    if (!stopped) {
      return res.status(404).json({ success: false, error: 'Execution not found or not running' });
    }
    res.json({ success: true, message: 'Execution stopped' });
  } catch (error) {
    logger.error(`[API] Stop execution error: ${error.message}`);
    next(error);
  }
};

/**
 * Lấy danh sách executions
 * GET /api/v1/scripts/executions
 */
exports.getExecutions = async (req, res, next) => {
  try {
    const executions = ScriptExecutionService.getExecutions();
    res.json({ success: true, data: executions });
  } catch (error) {
    logger.error(`[API] Get executions error: ${error.message}`);
    next(error);
  }
};

/**
 * Lấy logs của execution
 * GET /api/v1/scripts/executions/:execId/logs
 */
exports.getExecutionLogs = async (req, res, next) => {
  try {
    const logs = ScriptExecutionService.getLogs(req.params.execId);
    if (logs === null) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }
    res.json({ success: true, data: logs });
  } catch (error) {
    logger.error(`[API] Get execution logs error: ${error.message}`);
    next(error);
  }
};

/**
 * Import script từ file path
 * POST /api/v1/scripts/import
 */
exports.importScript = async (req, res, next) => {
  try {
    const { filePath, name } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'filePath is required' });
    }

    const script = ScriptService.importFromFile(filePath, name);
    res.status(201).json({ success: true, data: script });
  } catch (error) {
    logger.error(`[API] Import script error: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * Bắt đầu recording
 * POST /api/v1/scripts/recording/start
 */
exports.startRecording = async (req, res, next) => {
  try {
    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ success: false, error: 'profileId is required' });
    }

    const result = await RecordingService.startRecording(profileId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`[API] Start recording error: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * Dừng recording
 * POST /api/v1/scripts/recording/stop
 */
exports.stopRecording = async (req, res, next) => {
  try {
    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ success: false, error: 'profileId is required' });
    }

    const result = await RecordingService.stopRecording(profileId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`[API] Stop recording error: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * Lấy recording status
 * GET /api/v1/scripts/recording/status/:profileId
 */
exports.getRecordingStatus = async (req, res, next) => {
  try {
    const result = RecordingService.getStatus(req.params.profileId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`[API] Get recording status error: ${error.message}`);
    next(error);
  }
};

/**
 * Bắt đầu selector picker trên profile
 * POST /api/v1/scripts/picker/start
 */
exports.startPicker = async (req, res, next) => {
  try {
    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ success: false, error: 'profileId is required' });
    }

    const result = await SelectorPickerService.startPicker(profileId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`[API] Start picker error: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
};

/**
 * Hủy selector picker
 * POST /api/v1/scripts/picker/cancel
 */
exports.cancelPicker = async (req, res, next) => {
  try {
    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ success: false, error: 'profileId is required' });
    }

    await SelectorPickerService.cancelPicker(profileId);
    res.json({ success: true, message: 'Picker cancelled' });
  } catch (error) {
    logger.error(`[API] Cancel picker error: ${error.message}`);
    res.status(400).json({ success: false, error: error.message });
  }
};
