const path = require('path');
const os = require('os');
const tls = require('tls');
const requests = require('requestretry').defaults({ timeout: 60000 });
const { SocksClient } = require('socks');
const { rmSync, readFileSync, writeFileSync, createWriteStream } = require('fs');
const { access, readFile, writeFile, mkdir, readdir, copyFile, rename } = require('fs').promises;
const { spawn, execFile } = require('child_process');

const fontsCollection = require('./assets/fonts');
const logger = require('./logger');

const FONTS_URL = 'https://fonts.gologin.com/';
const FONTS_DIR_NAME = 'fonts';

const HOMEDIR = os.homedir();
const OS_PLATFORM = process.platform;

// Browser version mặc định cho profile mới
const DEFAULT_BROWSER_VERSION = 146;
// Browser version cho profile cũ (không có browserVersion trong metadata)
const LEGACY_BROWSER_VERSION = 143;

// Xác định đường dẫn browser dựa trên môi trường và version
function getBrowserPath(browserVersion = null) {
  const version = browserVersion || LEGACY_BROWSER_VERSION;
  // Sử dụng biến môi trường từ Electron main process (standalone build)
  if (process.env.APP_RESOURCES_PATH) {
    return path.join(process.env.APP_RESOURCES_PATH, `orbita-browser-${version}`);
  }
  // Development: thư mục gologin mặc định
  return path.join(HOMEDIR, '.gologin', 'browser', `orbita-browser-${version}`);
}


class ZUtils {

  /**
   * Downloads fonts from GoLogin server to browser fonts directory and copies them to profile
   * @param {string[]} [fontsList=[]] - List of font file names to download
   * @param {string} profilePath - The path to the profile directory
   * @returns {Promise<void>}
   */
  static async downloadFonts(fontsList = [], profilePath) {
    if (!fontsList.length) {
      return;
    }

    const browserFontsPath = path.join(getBrowserPath(), FONTS_DIR_NAME);
    await mkdir(browserFontsPath, { recursive: true });

    const files = await readdir(browserFontsPath);
    const fontsToDownload = fontsList.filter(font => !files.includes(font));

    let promises = fontsToDownload.map(font => requests.get(FONTS_URL + font, {
      maxAttempts: 5,
      retryDelay: 2000,
      timeout: 30 * 1000,
    })
      .pipe(createWriteStream(path.join(browserFontsPath, font)))
    );

    if (promises.length) {
      await Promise.all(promises);
    }

    promises = fontsList.map((font) =>
      copyFile(path.join(browserFontsPath, font), path.join(profilePath, FONTS_DIR_NAME, font)));

    await Promise.all(promises);
  }

  /**
   * Composes and downloads fonts for a profile based on the fonts list
   * @param {string[]} [fontsList=[]] - List of font values to include
   * @param {string} profilePath - The path to the profile directory
   * @param {boolean} [differentOs=false] - Whether the profile OS differs from current OS
   * @returns {Promise<void>}
   * @throws {Error} If no fonts to download are found when differentOs is true
   */
  static async composeFonts(fontsList = [], profilePath, differentOs = false) {
    if (!(fontsList.length && profilePath)) {
      return;
    }

    const fontsToDownload = fontsCollection
      .filter(elem => fontsList.includes(elem.value))
      .reduce((res, elem) => res.concat(elem.fileNames || []), []);

    if (differentOs && !fontsToDownload.length) {
      throw new Error('No fonts to download found. Use getAvailableFonts() method and set some fonts from this list');
    }
    fontsToDownload.push('LICENSE.txt');
    fontsToDownload.push('OFL.txt');

    const pathToFontsDir = path.join(profilePath, FONTS_DIR_NAME);
    const fontsDirExists = await access(pathToFontsDir).then(() => true, () => false);
    if (fontsDirExists) {
      rmSync(pathToFontsDir, { recursive: true });
    }

    await mkdir(pathToFontsDir, { recursive: true });
    await this.downloadFonts(fontsToDownload, profilePath);

    if (OS_PLATFORM === 'win') {
      await this.copyFontsConfigFile(profilePath);
    }
  }

  /**
   * Copies the fonts configuration file to the profile's Default directory
   * Replaces placeholder $$GOLOGIN_FONTS$$ with the actual fonts directory path
   * @param {string} profilePath - The path to the profile directory
   * @returns {Promise<void>}
   */
  static async copyFontsConfigFile(profilePath) {
    if (!profilePath) {
      return;
    }

    const fileContent = await readFile(path.resolve(__dirname, 'fonts_config'), 'utf-8');
    const result = fileContent.replace(/\$\$GOLOGIN_FONTS\$\$/g, path.join(profilePath, FONTS_DIR_NAME));

    const defaultFolderPath = path.join(profilePath, 'Default');
    await mkdir(defaultFolderPath, { recursive: true });
    await writeFile(path.join(defaultFolderPath, 'fonts_config'), result);
  }

  /**
   * Gets timezone information using SOCKS proxy
   * @param {Object} proxy - Proxy configuration object with mode, host, port, username, password
   * @returns {Promise<Object>} Timezone data containing timezone, IP, coordinates (ll), and accuracy
   */
  static async getTimezoneWithSocks(proxy) {
    logger.info(`[ZUtils] Connecting via SOCKS proxy: ${proxy.host}:${proxy.port}`);

    // Determine SOCKS version
    const socksType = proxy.mode === 'socks4' ? 4 : 5;

    const socksOptions = {
      proxy: {
        host: proxy.host,
        port: proxy.port,
        type: socksType
      },
      command: 'connect',
      destination: {
        host: 'time.gologin.com',
        port: 443
      }
    };

    // Add authentication if provided
    if (proxy.username && proxy.password) {
      socksOptions.proxy.userId = proxy.username;
      socksOptions.proxy.password = proxy.password;
    }

    try {
      // Create SOCKS connection
      const { socket } = await SocksClient.createConnection(socksOptions);

      // Upgrade to TLS
      const tlsSocket = tls.connect({
        host: 'time.gologin.com',
        socket: socket,
        servername: 'time.gologin.com'
      });

      return new Promise((resolve, reject) => {
        tlsSocket.on('secureConnect', () => {
          // Send HTTP request
          const request = 'GET /timezone HTTP/1.1\r\nHost: time.gologin.com\r\nConnection: close\r\n\r\n';
          tlsSocket.write(request);
        });

        let responseData = '';
        tlsSocket.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        tlsSocket.on('end', () => {
          try {
            // Parse HTTP response - extract JSON body
            const bodyStart = responseData.indexOf('\r\n\r\n');
            if (bodyStart === -1) {
              throw new Error('Invalid HTTP response');
            }
            const body = responseData.substring(bodyStart + 4);
            const result = JSON.parse(body);
            logger.info(`[ZUtils] Got timezone via SOCKS: ${result.timezone}, IP: ${result.ip}`);
            resolve(result);
          } catch (e) {
            logger.error(`[ZUtils] Failed to parse timezone response: ${e.message}`);
            reject(e);
          }
        });

        tlsSocket.on('error', (e) => {
          logger.error(`[ZUtils] TLS error: ${e.message}`);
          reject(e);
        });

        // Timeout
        tlsSocket.setTimeout(20000, () => {
          tlsSocket.destroy();
          reject(new Error('SOCKS proxy connection timeout'));
        });
      });
    } catch (e) {
      logger.error(`[ZUtils] SOCKS proxy error: ${e.message}`);
      throw e;
    }
  }

  /**
   * Gets timezone information from GoLogin API using proxy or local IP
   * @param {Object|null} proxy - Proxy configuration object with mode, host, port, username, password
   * @returns {Promise<Object>} Timezone data containing timezone, IP, coordinates (ll), and accuracy
   * @throws {Error} If proxy connection fails - indicates proxy is not working
   */
  static async getTimeZone(proxy) {
    let data = null;
    if (proxy !== null && proxy.mode !== "none") {
      if (proxy.mode.includes('socks')) {
        let lastError = null;
        for (let i = 0; i < 3; i++) {
          try {
            logger.info(`[ZUtils] Getting timezone via SOCKS proxy (attempt ${i + 1}/3)...`);
            return await this.getTimezoneWithSocks(proxy);
          } catch (e) {
            lastError = e;
            logger.warn(`[ZUtils] SOCKS proxy attempt ${i + 1} failed: ${e.message}`);
          }
        }
        // Proxy không hoạt động - báo lỗi rõ ràng
        const errorMsg = `Proxy không hoạt động: ${proxy.host}:${proxy.port} - ${lastError?.message || 'Connection failed'}`;
        logger.error(`[ZUtils] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // HTTP/HTTPS proxy
      try {
        const proxyUrl = `${proxy.mode}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
        logger.info(`[ZUtils] Getting timezone via HTTP proxy: ${proxy.host}:${proxy.port}`);
        data = await requests.get('https://time.gologin.com/timezone', { proxy: proxyUrl, timeout: 20 * 1000, maxAttempts: 3 });
      } catch (e) {
        const errorMsg = `Proxy không hoạt động: ${proxy.host}:${proxy.port} - ${e.message}`;
        logger.error(`[ZUtils] ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } else {
      data = await requests.get('https://time.gologin.com/timezone', { timeout: 20 * 1000, maxAttempts: 3 });
    }

    logger.info(`[ZUtils] Got timezone: ${data.body}`);
    return JSON.parse(data.body);
  }

  /**
   * Opens a browser profile with specified settings and proxy configuration
   * Handles fonts composition, timezone detection, and browser launch
   * @param {string} profilePath - The path to the profile directory
   * @param {Object|null} proxy - Proxy configuration object or null for no proxy
   * @param {string} proxy.mode - Proxy mode (http, https, socks4, socks5)
   * @param {string} proxy.host - Proxy host address
   * @param {number} proxy.port - Proxy port
   * @param {string} proxy.username - Proxy username
   * @param {string} proxy.password - Proxy password
   * @returns {Promise<void>}
   */
  static async openProfile(profilePath, proxy) {
    const childProcess = await this.launchBrowserWithProcess(profilePath, proxy);

    // Add event listeners for standalone use
    childProcess.on('close', (code) => {
      logger.info(`child process exited with code ${code}`);
    });

    return childProcess;
  }

  /**
   * Launches browser and returns the child process for management
   * Similar to openProfile but allows external process management
   * @param {string} profilePath - The path to the profile directory
   * @param {Object|null} proxy - Proxy configuration object or null for no proxy
   * @param {string|null} profileName - The display name of the profile
   * @returns {Promise<ChildProcess>} The spawned browser process
   */
  static async launchBrowserWithProcess(profilePath, proxy, profileName = null, debugPort = 0, browserVersion = null) {
    // Exclude host when using proxy
    const excludeHosts = [];

    // Get profile info
    const profileInfoPath = path.resolve(profilePath, 'infozz.json');

    const settings = JSON.parse(readFileSync(profileInfoPath, 'utf8'));
    const profileOs = settings.os;

    const differentOs = profileOs !== 'android' && (
      OS_PLATFORM === 'win32' && profileOs !== 'win' ||
      OS_PLATFORM === 'darwin' && profileOs !== 'mac' ||
      OS_PLATFORM === 'linux' && profileOs !== 'lin'
    );

    // Check profile already opened by other browser
    const singletonLockPath = path.join(profilePath, 'SingletonLock');
    const singletonLockExists = await access(singletonLockPath).then(() => true).catch(() => false);
    if (singletonLockExists) {
      logger.info('Removing SingletonLock');
      const { unlink } = require('fs').promises;
      await unlink(singletonLockPath);
      logger.info('SingletonLock removed');
    }

    // Xóa session/tab restore files để browser không mở lại tab cũ từ phiên trước
    const sessionsDir = path.join(profilePath, 'Default', 'Sessions');
    try {
      const { readdirSync, unlinkSync } = require('fs');
      if (require('fs').existsSync(sessionsDir)) {
        const sessionFiles = readdirSync(sessionsDir);
        if (sessionFiles.length > 0) {
          for (const f of sessionFiles) {
            try { unlinkSync(path.join(sessionsDir, f)); } catch (e) { /* ignore */ }
          }
          logger.info(`[Sessions] Cleared ${sessionFiles.length} session/tab restore files`);
        }
      }
    } catch (e) {
      logger.warn(`[Sessions] Could not clear session files: ${e.message}`);
    }

    // Xóa thêm Current Session / Current Tabs / Last Session / Last Tabs (legacy paths)
    const defaultDir = path.join(profilePath, 'Default');
    const legacySessionFiles = ['Current Session', 'Current Tabs', 'Last Session', 'Last Tabs'];
    for (const f of legacySessionFiles) {
      try { require('fs').unlinkSync(path.join(defaultDir, f)); } catch (e) { /* not exist = OK */ }
    }

    let preferencesPath = path.resolve(profilePath, 'Default', 'Preferences');
    let pref = JSON.parse(readFileSync(preferencesPath));

    // Copy needed fonts
    try {
      logger.info(`CurrentOS: ${OS_PLATFORM} / ProfileOS: ${profileOs} => ${differentOs}`);
      await ZUtils.composeFonts(settings.fonts, profilePath, differentOs);
    } catch (e) {
      console.trace(e);
    }

    // Get timezone from proxy
    let tz;
    try {
      tz = await this.getTimeZone(proxy);
    } catch (e) {
      if (proxy && proxy.mode !== 'none') {
        logger.error(`[ZUtils] PROXY ERROR: Không thể kết nối proxy ${proxy.mode}://${proxy.host}:${proxy.port}`);
        logger.error(`[ZUtils] Lý do: ${e.message}`);
        logger.error(`[ZUtils] Vui lòng kiểm tra: 1) Proxy đang hoạt động, 2) Thông tin đăng nhập đúng, 3) IP được whitelist`);
      }
      throw e;
    }

    // Patch Preferences with proxy
    const [latitude, longitude] = tz.ll;
    const accuracy = tz.accuracy;
    pref.gologin.geoLocation.latitude = parseFloat(latitude);
    pref.gologin.geoLocation.longitude = parseFloat(longitude);
    pref.gologin.geoLocation.accuracy = parseFloat(accuracy);

    // Update preferences
    pref.gologin.timezone.id = tz.timezone;
    pref.gologin.webRtc.public_ip = tz.ip;

    // Update profile name in browser display
    if (profileName) {
      pref.profile.name = profileName;
      pref.gologin.name = profileName;
    }

    // ★ FIX: Giả lập clean exit — nếu exit_type = "Crashed", Chrome sẽ bỏ qua
    // mọi setting và tự động restore tất cả tab cũ. Phải set = "Normal" trước launch.
    if (!pref.profile) pref.profile = {};
    pref.profile.exit_type = 'Normal';
    pref.profile.exited_cleanly = true;

    // Tắt restore session — mở tab mới thay vì restore tab cũ
    if (!pref.session) pref.session = {};
    pref.session.restore_on_startup = 5;  // 5 = mở New Tab page
    if (!pref.session.startup_urls) pref.session.startup_urls = [];

    // ★ FIX: Set browser language based on proxy timezone/country
    // MUST be done BEFORE writeFileSync so Chrome reads correct language on startup
    // Map timezone → country → primary language
    const tzToLang = {
      // East Asia
      'Asia/Seoul': { lang: 'ko', header: 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Tokyo': { lang: 'ja', header: 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Hong_Kong': { lang: 'zh-TW', header: 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Taipei': { lang: 'zh-TW', header: 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Shanghai': { lang: 'zh-CN', header: 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Chongqing': { lang: 'zh-CN', header: 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7' },
      // Southeast Asia
      'Asia/Bangkok': { lang: 'th', header: 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Ho_Chi_Minh': { lang: 'vi', header: 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Jakarta': { lang: 'id', header: 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Manila': { lang: 'fil', header: 'fil-PH,fil;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Singapore': { lang: 'en-SG', header: 'en-SG,en;q=0.9,zh;q=0.8' },
      'Asia/Kuala_Lumpur': { lang: 'ms', header: 'ms-MY,ms;q=0.9,en-US;q=0.8,en;q=0.7' },
      // South Asia
      'Asia/Kolkata': { lang: 'hi', header: 'hi-IN,hi;q=0.9,en-IN;q=0.8,en;q=0.7' },
      'Asia/Calcutta': { lang: 'hi', header: 'hi-IN,hi;q=0.9,en-IN;q=0.8,en;q=0.7' },
      // Middle East
      'Asia/Dubai': { lang: 'ar', header: 'ar-AE,ar;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Riyadh': { lang: 'ar', header: 'ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Istanbul': { lang: 'tr', header: 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Istanbul': { lang: 'tr', header: 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Tehran': { lang: 'fa', header: 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Asia/Jerusalem': { lang: 'he', header: 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7' },
      // Europe
      'Europe/Berlin': { lang: 'de', header: 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Vienna': { lang: 'de', header: 'de-AT,de;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Zurich': { lang: 'de', header: 'de-CH,de;q=0.9,fr;q=0.8,en;q=0.7' },
      'Europe/Paris': { lang: 'fr', header: 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Brussels': { lang: 'fr', header: 'fr-BE,fr;q=0.9,nl;q=0.8,en;q=0.7' },
      'Europe/Madrid': { lang: 'es', header: 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Rome': { lang: 'it', header: 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Lisbon': { lang: 'pt', header: 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Amsterdam': { lang: 'nl', header: 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Warsaw': { lang: 'pl', header: 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Prague': { lang: 'cs', header: 'cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Budapest': { lang: 'hu', header: 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Bucharest': { lang: 'ro', header: 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Athens': { lang: 'el', header: 'el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Helsinki': { lang: 'fi', header: 'fi-FI,fi;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Stockholm': { lang: 'sv', header: 'sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Oslo': { lang: 'nb', header: 'nb-NO,nb;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Copenhagen': { lang: 'da', header: 'da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Moscow': { lang: 'ru', header: 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Europe/Kiev': { lang: 'uk', header: 'uk-UA,uk;q=0.9,ru;q=0.8,en;q=0.7' },
      'Europe/Kyiv': { lang: 'uk', header: 'uk-UA,uk;q=0.9,ru;q=0.8,en;q=0.7' },
      'Europe/London': { lang: 'en-GB', header: 'en-GB,en;q=0.9' },
      'Europe/Dublin': { lang: 'en-GB', header: 'en-IE,en-GB;q=0.9,en;q=0.8' },
      // Americas
      'America/Sao_Paulo': { lang: 'pt-BR', header: 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' },
      'America/Mexico_City': { lang: 'es-MX', header: 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7' },
      'America/Argentina/Buenos_Aires': { lang: 'es-AR', header: 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7' },
      'America/New_York': { lang: 'en-US', header: 'en-US,en;q=0.9' },
      'America/Chicago': { lang: 'en-US', header: 'en-US,en;q=0.9' },
      'America/Denver': { lang: 'en-US', header: 'en-US,en;q=0.9' },
      'America/Los_Angeles': { lang: 'en-US', header: 'en-US,en;q=0.9' },
      'America/Toronto': { lang: 'en-CA', header: 'en-CA,en;q=0.9,fr;q=0.8' },
      // Oceania
      'Australia/Sydney': { lang: 'en-AU', header: 'en-AU,en;q=0.9' },
      'Pacific/Auckland': { lang: 'en-NZ', header: 'en-NZ,en;q=0.9' },
      // Africa
      'Africa/Cairo': { lang: 'ar', header: 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7' },
      'Africa/Lagos': { lang: 'en-NG', header: 'en-NG,en;q=0.9' },
      'Africa/Johannesburg': { lang: 'en-ZA', header: 'en-ZA,en;q=0.9' },
    };

    // ★ Language chỉ set LẦN ĐẦU TIÊN khi profile mới tạo
    // Các lần start sau giữ nguyên — giống hành vi người thật (set 1 lần, dùng mãi)
    const alreadyConfigured = pref.gologin && pref.gologin.languageConfigured === true;

    let browserLang;
    if (alreadyConfigured) {
      // Đã set rồi → đọc lại từ Preferences, không overwrite
      browserLang = (pref.intl && pref.intl.accept_languages || 'en-US,en').split(',')[0].split(';')[0].trim();
      logger.info(`[ZUtils] Language: giữ nguyên "${browserLang}" (đã set từ lần đầu)`);
    } else {
      // Lần đầu → set language từ timezone proxy
      const langConfig = tzToLang[tz.timezone] || { lang: 'en-US', header: 'en-US,en;q=0.9' };
      browserLang = langConfig.lang;

      const langList = langConfig.header.split(',').slice(0, 2).join(',');
      pref.gologin.langHeader = langConfig.header;
      pref.gologin.languages = langList;
      if (!pref.intl) pref.intl = {};
      pref.intl.accept_languages = langList;
      if (!pref.settings) pref.settings = {};
      if (!pref.settings.language) pref.settings.language = {};
      pref.settings.language.preferred_languages = langList;

      // Đánh dấu đã cấu hình → lần sau không đè lại
      pref.gologin.languageConfigured = true;

      logger.info(`[ZUtils] Language: SET LẦN ĐẦU → ${browserLang} (tz=${tz.timezone}) header=${langConfig.header}`);
    }

    let params = [
      `--user-data-dir=${profilePath}`,
      `--password-store=basic`,
      `--tz=${tz.timezone}`,
      `--lang=${browserLang}`,
      `--disable-session-crashed-bubble`,
      `--disable-features=InfiniteSessionRestore`
    ];

    // CDP remote debugging port cho Puppeteer
    if (debugPort > 0) {
      params.push(`--remote-debugging-port=${debugPort}`);
    }

    let fontsMasking = true;
    if (fontsMasking) {
      let arg = '--font-masking-mode=2';
      if (differentOs) {
        arg = '--font-masking-mode=3';
      }
      if (profileOs === 'android') {
        arg = '--font-masking-mode=1';
      }

      params.push(arg);
    }

    if (proxy && proxy.mode !== 'none') {
      excludeHosts.push(proxy.host);
      const hr_rules = `"MAP * 0.0.0.0 , EXCLUDE ${excludeHosts.join(",")}"`;

      // Format proxy server URL based on proxy type
      let proxyServerUrl;
      if (proxy.mode.includes('socks')) {
        // SOCKS4/SOCKS5 proxy
        proxyServerUrl = `${proxy.mode}://${proxy.host}:${proxy.port}`;
      } else {
        // HTTP/HTTPS proxy
        proxyServerUrl = `${proxy.host}:${proxy.port}`;
      }

      params.push(`--proxy-server=${proxyServerUrl}`);
      params.push(`--host-resolver-rules=${hr_rules}`);

      // Update proxy
      pref.gologin.proxy.username = proxy.username;
      pref.gologin.proxy.password = proxy.password;
    }

    // Save ALL preferences (geo + session + language + proxy) in single write
    writeFileSync(preferencesPath, JSON.stringify(pref));

    // Launching browser
    logger.info(`Launching browser:`);
    logger.info(`OS: ${process.platform}`);

    let BROWSER_EXE = 'Orbita';
    if (OS_PLATFORM == 'darwin') {
      BROWSER_EXE = path.join('Orbita-Browser.app', 'Contents', 'MacOS', 'Orbita');
    } else if (OS_PLATFORM == 'win32') {
      BROWSER_EXE = 'chrome.exe';
    } else {
      throw new Error(`browserExecutePath not implement for ${OS_PLATFORM} !!!`);
    }

    let browserExecutePath = path.join(getBrowserPath(browserVersion), BROWSER_EXE);

    logger.info(browserExecutePath);
    logger.info(params);

    const childProcess = spawn(browserExecutePath, params);

    // Setup stdout/stderr handlers to prevent freeze
    childProcess.stdout.on('data', (data) => {
      // console.log(`stdout: ${data}`);
    });

    childProcess.stderr.on('data', (data) => {
      // console.error(`stderr: ${data}`);
    });

    return childProcess;
  }

}

module.exports = {
  ZUtils,
  DEFAULT_BROWSER_VERSION,
  LEGACY_BROWSER_VERSION,
}