/**
 * Profile Routes - Định nghĩa API endpoints cho profiles
 */

const express = require('express');
const router = express.Router();
const controller = require('../controllers/profileController');

// Profile CRUD
router.post('/', controller.createProfile);
router.get('/', controller.listProfiles);
router.get('/:id', controller.getProfile);
router.delete('/:id', controller.deleteProfile);

// Browser actions
router.post('/:id/start', controller.startProfile);
router.post('/:id/stop', controller.stopProfile);

// Proxy management
router.put('/:id/proxy', controller.updateProxy);

// Name management
router.put('/:id/name', controller.updateName);

// Tags management
router.put('/:id/tags', controller.updateTags);

module.exports = router;
