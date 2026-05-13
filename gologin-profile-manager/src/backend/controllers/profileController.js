/**
 * Profile Controller - Xử lý requests từ API routes
 */

const ProfileService = require('../services/profileService');
const BrowserService = require('../services/browserService');
const PiaProxyService = require('../services/piaProxyService');
const SettingsService = require('../services/settingsService');
const logger = require('../../../logger');

/**
 * Tạo profile mới
 * POST /api/v1/profiles
 */
exports.createProfile = async (req, res, next) => {
  try {
    const { name, platform = 'win', proxy } = req.body;

    logger.info(`[API] POST /profiles - Creating profile: name=${name}, platform=${platform}, proxy=${proxy ? 'yes' : 'no'}`);

    const profile = await ProfileService.create(name, platform, proxy);

    res.status(201).json({
      success: true,
      data: profile
    });
  } catch (error) {
    logger.error(`[API] Create profile error: ${error.message}`);
    next(error);
  }
};

/**
 * Lấy danh sách profiles
 * GET /api/v1/profiles
 */
exports.listProfiles = async (req, res, next) => {
  try {
    logger.info(`[API] GET /profiles - Listing all profiles`);

    const profiles = await ProfileService.listAll();

    res.json({
      success: true,
      data: profiles,
      count: profiles.length
    });
  } catch (error) {
    logger.error(`[API] List profiles error: ${error.message}`);
    next(error);
  }
};

/**
 * Lấy chi tiết một profile
 * GET /api/v1/profiles/:id
 */
exports.getProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info(`[API] GET /profiles/${id} - Getting profile details`);

    const profile = await ProfileService.getById(id);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    logger.error(`[API] Get profile error: ${error.message}`);
    next(error);
  }
};

/**
 * Chạy browser với profile
 * POST /api/v1/profiles/:id/start
 */
exports.startProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { proxy } = req.body;

    logger.info(`[API] POST /profiles/${id}/start - Starting browser`);

    const result = await BrowserService.startBrowser(id, proxy);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`[API] Start profile error: ${error.message}`);

    // Trả về lỗi cụ thể
    if (error.message.includes('already running')) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    next(error);
  }
};

/**
 * Dừng browser của profile
 * POST /api/v1/profiles/:id/stop
 */
exports.stopProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info(`[API] POST /profiles/${id}/stop - Stopping browser`);

    const result = await BrowserService.stopBrowser(id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`[API] Stop profile error: ${error.message}`);
    next(error);
  }
};

/**
 * Xóa profile
 * DELETE /api/v1/profiles/:id
 */
exports.deleteProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info(`[API] DELETE /profiles/${id} - Deleting profile`);

    // Dừng browser nếu đang chạy
    await BrowserService.stopBrowser(id);

    // Xóa profile
    await ProfileService.delete(id);

    res.json({
      success: true,
      message: `Profile ${id} deleted successfully`
    });
  } catch (error) {
    logger.error(`[API] Delete profile error: ${error.message}`);
    next(error);
  }
};

/**
 * Cập nhật proxy cho profile
 * PUT /api/v1/profiles/:id/proxy
 */
exports.updateProxy = async (req, res, next) => {
  try {
    const { id } = req.params;
    const proxy = req.body;

    logger.info(`[API] PUT /profiles/${id}/proxy - Updating proxy`);

    const profile = await ProfileService.updateProxy(id, proxy);

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    logger.error(`[API] Update proxy error: ${error.message}`);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    next(error);
  }
};

/**
 * Cập nhật tên profile
 * PUT /api/v1/profiles/:id/name
 */
exports.updateName = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    logger.info(`[API] PUT /profiles/${id}/name - Updating name to: ${name}`);

    const profile = await ProfileService.updateName(id, name);

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    logger.error(`[API] Update name error: ${error.message}`);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    next(error);
  }
};

/**
 * Lấy trạng thái các profiles đang chạy
 * GET /api/v1/status
 */
exports.getStatus = async (req, res, next) => {
  try {
    logger.info(`[API] GET /status - Getting running status`);

    const running = BrowserService.getRunningBrowsers();

    res.json({
      success: true,
      data: {
        running,
        count: running.length
      }
    });
  } catch (error) {
    logger.error(`[API] Get status error: ${error.message}`);
    next(error);
  }
};

/**
 * Cập nhật tags cho profile
 * PUT /api/v1/profiles/:id/tags
 */
exports.updateTags = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tags } = req.body;

    logger.info(`[API] PUT /profiles/${id}/tags - Updating tags`);

    const profile = await ProfileService.updateTags(id, tags);

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    logger.error(`[API] Update tags error: ${error.message}`);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    next(error);
  }
};

/**
 * Lấy danh sách tất cả tags
 * GET /api/v1/tags
 */
exports.getAllTags = async (req, res, next) => {
  try {
    logger.info(`[API] GET /tags - Getting all tags`);

    const tags = ProfileService.getAllTags();

    res.json({
      success: true,
      data: tags
    });
  } catch (error) {
    logger.error(`[API] Get all tags error: ${error.message}`);
    next(error);
  }
};

/**
 * Lấy danh sách countries cho PIA Proxy
 * GET /api/v1/pia/countries
 */
exports.getPiaCountries = async (req, res, next) => {
  try {
    logger.info(`[API] GET /pia/countries - Getting PIA countries`);

    const countries = PiaProxyService.getPopularCountries();

    res.json({
      success: true,
      data: countries
    });
  } catch (error) {
    logger.error(`[API] Get PIA countries error: ${error.message}`);
    next(error);
  }
};

/**
 * Kiểm tra PIA Proxy client có đang chạy không
 * GET /api/v1/pia/status
 */
exports.getPiaStatus = async (req, res, next) => {
  try {
    logger.info(`[API] GET /pia/status - Checking PIA client status`);

    const isRunning = await PiaProxyService.isClientRunning();

    res.json({
      success: true,
      data: {
        isRunning,
        message: isRunning ? 'PIA Proxy client is running' : 'PIA Proxy client is not running'
      }
    });
  } catch (error) {
    logger.error(`[API] Get PIA status error: ${error.message}`);
    next(error);
  }
};

/**
 * Order PIA Proxy cho profile
 * POST /api/v1/pia/order
 */
exports.orderPiaProxy = async (req, res, next) => {
  try {
    const { profileId, country, port } = req.body;

    logger.info(`[API] POST /pia/order - Ordering PIA proxy for profile ${profileId}, country=${country}`);

    if (!profileId || !country) {
      return res.status(400).json({
        success: false,
        error: 'profileId and country are required'
      });
    }

    const result = await PiaProxyService.orderProxy(profileId, country, port);

    if (result.success) {
      // Update profile metadata with PIA proxy
      const proxyConfig = {
        mode: 'pia',
        piaCountry: country.toUpperCase(),
        piaPort: result.proxy.port,
        host: result.proxy.host,
        port: result.proxy.port,
        orderedAt: result.proxy.orderedAt
      };

      await ProfileService.updateProxy(profileId, proxyConfig);

      res.json({
        success: true,
        data: {
          proxy: proxyConfig,
          message: `PIA Proxy ordered successfully: socks5://127.0.0.1:${result.proxy.port}`
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error(`[API] Order PIA proxy error: ${error.message}`);
    next(error);
  }
};

/**
 * Lấy tất cả settings
 * GET /api/v1/settings
 */
exports.getSettings = async (req, res, next) => {
  try {
    logger.info(`[API] GET /settings - Getting all settings`);

    const settings = SettingsService.getAll();

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error(`[API] Get settings error: ${error.message}`);
    next(error);
  }
};

/**
 * Cập nhật profiles folder
 * PUT /api/v1/settings/profiles-folder
 */
exports.setProfilesFolder = async (req, res, next) => {
  try {
    const { folder } = req.body;

    logger.info(`[API] PUT /settings/profiles-folder - Setting folder to: ${folder}`);

    if (!folder) {
      return res.status(400).json({
        success: false,
        error: 'Folder path is required'
      });
    }

    const settings = SettingsService.setProfilesFolder(folder);

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error(`[API] Set profiles folder error: ${error.message}`);
    next(error);
  }
};

/**
 * Lấy danh sách tags từ settings
 * GET /api/v1/settings/tags
 */
exports.getSettingsTags = async (req, res, next) => {
  try {
    logger.info(`[API] GET /settings/tags - Getting tags`);

    const tags = SettingsService.getTags();

    res.json({
      success: true,
      data: tags
    });
  } catch (error) {
    logger.error(`[API] Get settings tags error: ${error.message}`);
    next(error);
  }
};

/**
 * Thêm tag mới vào settings
 * POST /api/v1/settings/tags
 */
exports.addSettingsTag = async (req, res, next) => {
  try {
    const { tag } = req.body;

    logger.info(`[API] POST /settings/tags - Adding tag: ${tag}`);

    if (!tag || !tag.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Tag name is required'
      });
    }

    const tags = SettingsService.addTag(tag);

    res.json({
      success: true,
      data: tags
    });
  } catch (error) {
    logger.error(`[API] Add settings tag error: ${error.message}`);

    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    next(error);
  }
};

/**
 * Xóa tag từ settings
 * DELETE /api/v1/settings/tags/:tag
 */
exports.deleteSettingsTag = async (req, res, next) => {
  try {
    const { tag } = req.params;

    logger.info(`[API] DELETE /settings/tags/${tag} - Deleting tag`);

    const tags = SettingsService.deleteTag(decodeURIComponent(tag));

    res.json({
      success: true,
      data: tags
    });
  } catch (error) {
    logger.error(`[API] Delete settings tag error: ${error.message}`);
    next(error);
  }
};
