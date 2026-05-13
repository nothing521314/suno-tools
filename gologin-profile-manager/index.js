let axios = require("axios");
let url = require('url');
const fs = require('fs')
const path = require('path')
const ExtractZip = require('extract-zip')
const crypto = require("crypto");
const os = require('os');

var logger = require("./logger");

require('dotenv').config({ path: `${process.env.NODE_ENV || ''}.env` });
// require('dotenv').config();

// Xác định đường dẫn gốc dựa trên môi trường
function getBasePath() {
  // Sử dụng biến môi trường từ Electron main process
  if (process.env.APP_BASE_PATH) {
    return process.env.APP_BASE_PATH;
  }
  // Development: thư mục project
  return __dirname;
}

// Set header authentication for callback
// axios.defaults.headers.common['Authorization'] = `Bearer ${process.env.GOLOGIN_TOKEN}`;


/**
 * Makes a GET request to the specified URL with authentication headers
 * @param {string} m_url - The base URL for the request
 * @param {Object} m_params - Query parameters to append to the URL
 * @returns {Promise<Object>} The axios response data
 */
const getRequest = async (m_url, m_params) => {
    const params = new url.URLSearchParams(m_params);
    const request_url = `${m_url}?${params}`;

    let authenHeader = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) GoLogin/3.0.3 Chrome/87.0.4280.141 Electron/11.4.7 Safari/537.36',
        'Authorization': `Bearer ${process.env.GOLOGIN_TOKEN}`
    }

    logger.info(`GET ${request_url}`);
    return await axios.get(request_url, { headers: authenHeader });
}

/**
 * Saves profile data to a JSON file in the backups directory
 * @param {string} platformId - The platform identifier (e.g., 'win', 'mac', 'android')
 * @param {string} profile_id - The profile ID to use as filename
 * @param {string} m_text - The JSON string content to save
 * @returns {Promise<void>}
 */
const saveFile = async (platformId, profile_id, m_text) => {
    const profilePath = path.resolve(getBasePath(), 'backups', platformId, `${profile_id}.json`);

    fs.writeFile(profilePath, m_text, function (err, data) {
        if (err) {
            logger.error(err);
            return;
        }

        logger.info(`Saved profile success: ${profilePath}`);
    });
}

// const postData = async(url, params) => {
//     let authenHeader = {
//         'Authorization' : process.env.GOLOGIN_TOKEN
//     }

//     logger.info(`Send notify: ${JSON.stringify(params)}`);

//     await axios.post(`${url}`, params)
//         .then(response => {
//             return response.data
//         })
//         .then(result => {
//             logger.info(`Response: ${params.data.txhash} > Result: ${JSON.stringify(result)}`);
//         })
//         .catch(error => {
//             logger.error(`Error: ${error.response.data.error}`)
//         })
//     // console.log("\rResult: ", JSON.stringify(result));
// }

/**
 * Creates a default profile by extracting from the default_profile.zip archive
 * @param {string} profilePath - The target directory path where the profile will be created
 * @returns {Promise<void>}
 */
const createDefaultProfile = async (profilePath) => {
    const defaultPath = path.resolve(getBasePath(), 'assets', 'default_profile.zip');

    // Extract zip
    await ExtractZip(defaultPath, { dir: profilePath })
    logger.info(`Created default profile: ${profilePath}`)
}

/**
 * Gets the temporary profile path for a given profile ID
 * @param {string} profileId - The profile ID
 * @returns {Promise<string>} The resolved path to the temporary profile directory
 */
const getTempProfilePath = async (profileId) => {
    return path.resolve(getBasePath(), 'tmp', profileId);
}

/**
 * Gets the profile path for a given profile ID
 * @param {string} profileId - The profile ID
 * @returns {Promise<string>} The resolved path to the profile directory
 */
const getProfilePath = async (profileId) => {
    return path.resolve(getBasePath(), 'data', 'profiles', profileId);
}

/**
 * Generates a random floating-point number within a specified range
 * @param {number} min - The minimum value (inclusive)
 * @param {number} max - The maximum value (exclusive)
 * @param {number} [decimals=0] - The number of decimal places to round to
 * @returns {number} A random float between min and max with specified decimal precision
 */
function getRandomFloat(min, max, decimals = 0) {
    const str = (Math.random() * (max - min) + min);

    if (decimals > 0) {
        return parseFloat(str.toFixed(decimals));
    } else {
        return parseFloat(str);
    }
}

/**
 * Applies browser fingerprint settings to a profile's Preferences file
 * @param {Object} settings - The profile settings object containing navigator, webGL, and other metadata
 * @param {string} targetProfile - The path to the target profile directory
 * @param {string} profileId - The profile ID to assign
 * @returns {Promise<void>}
 */
const applyProfileSetting = async (settings, targetProfile, profileId) => {
    let preferencesPath = path.resolve(targetProfile, 'Default', 'Preferences');
    let pref = JSON.parse(fs.readFileSync(preferencesPath));

    let [screenWidth, screenHeight] = settings.navigator.resolution.split('x');
    let webGlMode = true; //settings.webGLMetadata.mode == 'noise';
    let canvasNoiseValue = getRandomFloat(0.10000001, 0.99999999, 8);
    let webglNoiseValue = getRandomFloat(3.001, 80.999, 3);
    let audioNoiseValue = parseFloat(`${getRandomFloat(1.000000000001, 9.999999999999, 12)}e-8`);
    let clientRectsNoice = getRandomFloat(1.00001, 9.99999, 5);

    // Apply Preference
    logger.info("Applying new profile settings...");

    pref.profile.name = profileId;
    pref.profile.exit_type = 'Normal';

    pref.gologin.name = profileId;
    pref.gologin.profile_id = profileId;

    pref.gologin.startupUrl = "https://iphey.com";                                  // TODO: Fill with proxy value
    pref.gologin.timezone.id = "America/Los_Angeles";                               // TODO: Fill with proxy value
    pref.gologin.userAgent = settings.navigator.userAgent;

    pref.gologin.webgl.metadata.mode = webGlMode;    // true
    pref.gologin.webgl.metadata.renderer = settings.webGLMetadata.renderer;         // "ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics 640, OpenGL 4.1)",
    pref.gologin.webgl.metadata.vendor = settings.webGLMetadata.vendor;             // "Google Inc. (Intel Inc.)"

    pref.gologin.webGl.mode = webGlMode;
    pref.gologin.webGl.renderer = settings.webGLMetadata.renderer;
    pref.gologin.webGl.vendor = settings.webGLMetadata.vendor;

    pref.gologin.webgl_noice_enable = webGlMode;
    pref.gologin.webgl_noise_enable = webGlMode;
    pref.gologin.webgl_noise_value = webglNoiseValue;
    pref.gologin.webglNoiceEnable = webGlMode
    pref.gologin.webglNoiseValue = webglNoiseValue;
    pref.gologin.webglParams.extensions = settings.webglParams.extensions;
    pref.gologin.webglParams.glParamValues = settings.webglParams.glParamValues;
    pref.gologin.webglParams.glCanvas = settings.webglParams.glCanvas;
    pref.gologin.webglParams.shaiderPrecisionFormat = settings.webglParams.shaiderPrecisionFormat;
    pref.gologin.webglParams.supportedFunctions = settings.webglParams.supportedFunctions;
    pref.gologin.webglParams.textureMaxAnisotropyExt = settings.webglParams.textureMaxAnisotropyExt;

    pref.gologin.webRtc.fill_based_on_ip = true;
    pref.gologin.webRtc.local_ip_masking = true;
    pref.gologin.webRtc.localIps = "";
    pref.gologin.webRtc.mode = "public";
    pref.gologin.webRtc.public_ip = "";         // TODO: Fill with proxy value

    //pref.countryid_at_install = 21077;
    //pref.gologin.geoLocation.latitude = 0;         // TODO: Check this value
    //pref.gologin.geoLocation.longitude = 0;        // TODO: Check this value
    //pref.gologin.geoLocation.accuracy = 100;       // TODO: Check this value

    pref.gologin.navigator.max_touch_points = settings.navigator.maxTouchPoints;
    pref.gologin.navigator.platform = settings.navigator.platform;    // "MacIntel", "Linux x86_64"

    pref.gologin.screenWidth = parseInt(screenWidth);
    pref.gologin.screenHeight = parseInt(screenHeight);

    pref.gologin.mobile.enable = settings.os.toLowerCase() == 'android';
    pref.gologin.mobile.device_scale_factor = parseFloat(settings.devicePixelRatio);   // 1.00000001, 2.00000001
    pref.gologin.mobile.width = parseInt(screenWidth);
    pref.gologin.mobile.height = parseInt(screenHeight);

    pref.gologin.canvasMode = "noise";
    pref.gologin.canvasNoise = canvasNoiseValue;

    pref.gologin.client_rects_noise_enable = true;
    pref.gologin.get_client_rects_noise = clientRectsNoice;
    pref.gologin.getClientRectsNoice = clientRectsNoice;

    pref.gologin.deviceMemory = settings.navigator.deviceMemory * 1024;         // RAM
    pref.gologin.hardwareConcurrency = settings.navigator.hardwareConcurrency;  // CPU cores

    pref.gologin.is_m1 = settings.navigator.platform.toLowerCase().includes('m1');

    pref.gologin.langHeader = settings.navigator.language;      // "en-US,en;q=0.9,de-DE;q=0.8,de;q=0.7,fr;q=0.6"
    pref.gologin.languages = "en-US,en";                        // TODO: Get from IP

    pref.gologin.audioContext.enable = true
    pref.gologin.audioContext.noiseValue = audioNoiseValue;

    pref.gologin.mediaDevices.uid = crypto.randomBytes(29).toString("hex");     // "5e725c4151ce4fec82bb7e882ed61dc165fbf3127e174cf3b5519a0f6a"
    pref.gologin.mediaDevices.enable = true
    if (settings.mediaDevices.audioInputs) {
        pref.gologin.mediaDevices.audioInputs = settings.mediaDevices.audioInputs;
    }
    if (settings.mediaDevices.audioOutputs) {
        pref.gologin.mediaDevices.audioOutputs = settings.mediaDevices.audioOutputs;
    }
    if (settings.mediaDevices.videoInputs) {
        pref.gologin.mediaDevices.videoInputs = settings.mediaDevices.videoInputs;
    }

    pref.gologin.timezone.id = 'America/New_York';  // TODO: Get from IP

    // Copy fonts
    logger.info("Sync fonts for new profile...");
    let profileInfo = {
        id: profileId,
        os: settings.os,
        width: parseInt(screenWidth),
        height: parseInt(screenHeight),
        userAgent: settings.navigator.userAgent,
        fonts: settings.fonts
    }
    let infoPath = path.resolve(targetProfile, 'infozz.json');
    fs.writeFileSync(infoPath, JSON.stringify(profileInfo));

    // Backup old file
    // FS.renameSync(preferencesPath, `${preferencesPath}.bak`);

    // Save new profile settings
    //FS.writeFileSync(preferencesPath, JSON.stringify(pref, null, "\t"));
    fs.writeFileSync(preferencesPath, JSON.stringify(pref));

    logger.info("Save new profile done!!!");
}

/**
 * Creates a new browser profile with randomized fingerprint settings
 * @param {string} platformId - The platform identifier (e.g., 'win', 'mac', 'android')
 * @param {string|null} [profileId=null] - Optional custom profile ID. If null, generates a random ID
 * @returns {Promise<string>} The platform ID of the created profile
 */
const getNewProfile = async (platformId, profileId = null) => {
    //let platformId = 'android';
    if (profileId == null) {
        let profileId = crypto.randomBytes(12).toString("hex");;
    }
    // Lưu profile trực tiếp vào profiles/win/{id}/ (không còn zip)
    let profilePath = path.resolve(getBasePath(), 'data', 'profiles', platformId, profileId);

    logger.info(`Creating new ${platformId} / profileId: ${profileId}...`);

    const profile_url = 'https://api.gologin.com/browser/fingerprint';
    const params = {
        os: platformId
    };

    // logger.info(JSON.stringify(authenHeader));
    logger.info(`Params: ${JSON.stringify(params)}`);

    await getRequest(profile_url, params)
        .then(response => {
            return response.data
        })
        .then(async (result) => {
            //logger.info(`Response: ${params.data.txhash} > Result: ${JSON.stringify(result)}`);
            // logger.info(`Response: ${JSON.stringify(result)}`);

            // Tạo profile trực tiếp tại profilePath (không qua tmp)
            await createDefaultProfile(profilePath);

            // Apply new profile setting
            await applyProfileSetting(result, profilePath, profileId);

            logger.info("Created profile finished!");

            return platformId;
        })
        .catch(error => {
            logger.error(`Error: ${error}`)
        })
}

/**
 * Creates a promise that resolves after a specified delay
 * @param {number} time - The delay time in milliseconds
 * @returns {Promise<void>} A promise that resolves after the specified time
 */
function delay(time) {
    return new Promise((resolve) => {
        setTimeout(resolve, time)
    });
}

/**
 * Main function that orchestrates the profile creation process
 * Creates multiple profiles for each specified platform with random delays between creations
 * @returns {Promise<void>}
 */
async function main() {
    // Listen events
    logger.info("Start....");

    let items = ['win'];

    for (const platformId of items) {
        // Prepare disk
        fs.mkdirSync(path.join(getBasePath(), 'data', 'profiles', platformId), { recursive: true });

	counter = 1;
        for (var i = 0; i < 5; i++) {
            logger.info('');
            await getNewProfile(platformId, `${counter}`.padStart(12, '0'));
            await delay( 1000 + Math.random() * 2000);

            // Increase counter
            counter++;
        }
        // await delay(10000);
    };
};

/**
 * Test function for creating a single profile from sample data
 * @returns {Promise<void>}
 */
async function test() {
    let profileId = 'U001';

    let platformId = 'mac';
    let profilePath = path.join(getBasePath(), 'data', 'profiles', platformId, profileId);

    let samplePath = path.join(getBasePath(), 'U001.json');
    let sampleJSON = JSON.parse(fs.readFileSync(samplePath));

    // Create new profile from default_profile
    let tempProfile = path.resolve(getBasePath(), 'tmp', profileId);
    await createDefaultProfile(tempProfile);

    // Apply new profile setting
    await applyProfileSetting(sampleJSON, tempProfile, profileId);

    // Move tmpProfile to profilePath
    logger.info("Moving temp profile to profiles folder...")
    fs.renameSync(tempProfile, profilePath);
}

// Export functions for use as module
module.exports = {
  getNewProfile,
  createDefaultProfile,
  applyProfileSetting,
  getRequest,
  getTempProfilePath,
  getProfilePath,
  getRandomFloat
};

// Run main only if called directly
if (require.main === module) {
  main();
}

