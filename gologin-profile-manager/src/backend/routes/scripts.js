/**
 * Script Routes - Định nghĩa API endpoints cho scripts
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/scriptController');

// Executions (phải đặt trước /:id để tránh conflict)
router.get('/executions', controller.getExecutions);
router.post('/executions/:execId/stop', controller.stopExecution);
router.get('/executions/:execId/logs', controller.getExecutionLogs);

// Import script
router.post('/import', controller.importScript);

// Recording (đặt trước /:id để tránh conflict)
router.post('/recording/start', controller.startRecording);
router.post('/recording/stop', controller.stopRecording);
router.get('/recording/status/:profileId', controller.getRecordingStatus);

// Selector Picker
router.post('/picker/start', controller.startPicker);
router.post('/picker/cancel', controller.cancelPicker);

// Script CRUD
router.post('/', controller.createScript);
router.get('/', controller.listScripts);
router.get('/:id', controller.getScript);
router.put('/:id', controller.updateScript);
router.delete('/:id', controller.deleteScript);

// Run script
router.post('/:id/run', controller.runScript);
router.post('/:id/run-batch', controller.runBatch);

module.exports = router;
