#!/usr/bin/env node
/**
 * TikTok Music Scraper - Launcher tích hợp (Worker Model)
 *
 * Tự động: Start server → Tạo profile → Start browser → Spawn workers
 * Mỗi profile = 1 worker độc lập, xong thì tự restart ngay (cooldown 5s)
 * Dừng bằng Ctrl+C
 *
 * Usage:
 *   node run_scraper.js              (hỏi interactive)
 *   node run_scraper.js 5            (chạy 5 luồng)
 *   node run_scraper.js 10 --yes     (chạy 10 luồng, bỏ qua confirm)
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

// ========== CẤU HÌNH ==========
const API_BASE = 'http://127.0.0.1:3000/api/v1';
const SCRIPT_ID = 'tiktok_music_scraper';
const SERVER_SCRIPT = path.join(__dirname, 'src', 'backend', 'server.js');
const MAX_THREADS = 20;
const PROFILE_PLATFORM = 'win';
const WORKER_COOLDOWN = 5000;      // Nghỉ 5s giữa các lần chạy (per-worker)
const WORKER_POLL_INTERVAL = 5000; // Worker poll execution status mỗi 5s
const DISPLAY_INTERVAL = 10000;    // Cập nhật status bar mỗi 10s
const WORKER_STAGGER_DELAY = 3000; // 3s giữa mỗi worker khởi động (tránh nghẽn CPU)

// ========== TRẠNG THÁI ==========
let totalSubmitted = 0;
let totalDuplicate = 0;
let totalSkipped = 0;
let totalVideos = 0;
let totalMusicNotFound = 0;
let startTime = Date.now();
let isShuttingDown = false;
let activeProfileIds = [];  // Track profile đang chạy để shutdown

// Per-worker state (keyed by workerIndex)
const workerStats = {};

// Profile name lookup (profileId → name)
const profileNames = {};

// ========== TIỆN ÍCH ==========

function log(msg) {
  const ts = new Date().toLocaleTimeString('vi-VN');
  console.log(`[${ts}] ${msg}`);
}

function logOk(msg) { log(`✅ ${msg}`); }
function logErr(msg) { log(`❌ ${msg}`); }
function logInfo(msg) { log(`ℹ️  ${msg}`); }
function logWait(msg) { log(`⏳ ${msg}`); }

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

// HTTP request helper
function httpReq(method, urlStr, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(urlStr);
    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      },
      timeout: 120000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

    if (postData) req.write(postData);
    req.end();
  });
}

function askQuestion(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== API SERVER ==========

async function checkServerRunning() {
  try {
    const res = await httpReq('GET', `${API_BASE}/health`);
    return res.status === 200 && res.data && res.data.success;
  } catch (e) {
    return false;
  }
}

async function startApiServer() {
  logWait('Đang khởi động API server...');

  const serverProcess = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, APP_BASE_PATH: __dirname, APP_RESOURCES_PATH: __dirname }
  });

  serverProcess.unref();

  serverProcess.stdout.on('data', (data) => {
    if (data.toString().includes('Running on port')) {
      logOk('API server đang chạy!');
    }
  });

  serverProcess.stderr.on('data', () => {});

  const maxWait = 30;
  for (let i = 0; i < maxWait; i++) {
    await delay(1000);
    if (await checkServerRunning()) return true;
    if (i % 5 === 4) logWait(`Vẫn đang chờ server... (${i + 1}s)`);
  }
  return false;
}

async function ensureServer() {
  if (await checkServerRunning()) {
    logOk('API server đã sẵn sàng');
    return true;
  }
  const ok = await startApiServer();
  if (!ok) {
    logErr('Không thể khởi động API server sau 30 giây!');
    return false;
  }
  return true;
}

// ========== PROFILE ==========

async function getExistingProfiles() {
  try {
    const res = await httpReq('GET', `${API_BASE}/profiles`);
    if (res.status === 200 && res.data.success) return res.data.data || [];
  } catch (e) {}
  return [];
}

async function createProfile(index) {
  try {
    const res = await httpReq('POST', `${API_BASE}/profiles`, { platform: PROFILE_PLATFORM });
    if (res.status === 201 && res.data.success) return res.data.data;
    logErr(`Tạo profile #${index} thất bại: ${JSON.stringify(res.data).slice(0, 200)}`);
    return null;
  } catch (e) {
    logErr(`Tạo profile #${index} lỗi: ${e.message}`);
    return null;
  }
}

async function ensureProfiles(needed) {
  const existing = await getExistingProfiles();
  const running = existing.filter(p => p.status === 'running').length;
  const stopped = existing.filter(p => p.status !== 'running').length;

  logInfo(`Hiện có: ${existing.length} profile (${running} đang chạy, ${stopped} dừng)`);

  let available = [...existing];

  if (available.length >= needed) {
    logOk(`Đủ ${needed} profile sẵn có`);
    return available.slice(0, needed);
  }

  const toCreate = needed - available.length;
  logWait(`Cần tạo thêm ${toCreate} profile...`);

  for (let i = 0; i < toCreate; i++) {
    process.stdout.write(`\r  Đang tạo profile ${i + 1}/${toCreate}...`);
    const profile = await createProfile(available.length + i + 1);
    if (profile) {
      available.push(profile);
    } else {
      logErr(`\nKhông thể tạo đủ profile. Đã tạo ${i}/${toCreate}`);
      break;
    }
    if (i < toCreate - 1) await delay(500);
  }

  console.log('');
  logOk(`Đã chuẩn bị ${available.length} profile`);
  return available.slice(0, needed);
}

// ========== BROWSER ==========

async function stopBrowser(profileId) {
  try {
    const res = await httpReq('POST', `${API_BASE}/profiles/${profileId}/stop`);
    return res.status === 200;
  } catch (e) { return false; }
}

async function deleteProfile(profileId) {
  try {
    const res = await httpReq('DELETE', `${API_BASE}/profiles/${profileId}`);
    return res.status === 200;
  } catch (e) { return false; }
}

/**
 * Thay thế profile bị CAPTCHA:
 * 1. Stop browser cũ
 * 2. Xóa profile cũ
 * 3. Tạo profile mới
 * 4. Start browser mới
 * @returns {Object|null} profile mới hoặc null nếu thất bại
 */
async function replaceCaptchaProfile(oldProfileId) {
  logWait(`[CAPTCHA] Đang thay thế profile ${shortId(oldProfileId)}...`);

  // 1. Stop browser
  await stopBrowser(oldProfileId);
  await delay(2000);

  // 2. Xóa profile cũ
  const deleted = await deleteProfile(oldProfileId);
  if (deleted) {
    logOk(`[CAPTCHA] Đã xóa profile ${shortId(oldProfileId)}`);
  } else {
    logErr(`[CAPTCHA] Không thể xóa profile ${shortId(oldProfileId)}`);
  }

  // 3. Tạo profile mới
  logWait('[CAPTCHA] Đang tạo profile mới...');
  const newProfile = await createProfile(0);
  if (!newProfile) {
    logErr('[CAPTCHA] Không thể tạo profile mới!');
    return null;
  }
  logOk(`[CAPTCHA] Profile mới: ${shortId(newProfile.profileId)}`);

  // 4. Start browser mới
  const startResult = await startBrowser(newProfile.profileId);
  if (!startResult.ok) {
    logErr(`[CAPTCHA] Không thể khởi chạy browser mới: ${startResult.error}`);
    return null;
  }
  logOk(`[CAPTCHA] Browser mới đã chạy: ${shortId(newProfile.profileId)}`);

  // Đợi browser load
  await delay(8000);

  return newProfile;
}

async function startBrowser(profileId) {
  try {
    const res = await httpReq('POST', `${API_BASE}/profiles/${profileId}/start`, {});
    if (res.status === 200 && res.data.success) return { ok: true, pid: res.data.data.pid };
    if (res.status === 409) return { ok: true, alreadyRunning: true };
    return { ok: false, error: JSON.stringify(res.data).slice(0, 200) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function ensureBrowsersRunning(profiles) {
  logWait(`Đang kiểm tra/khởi chạy ${profiles.length} trình duyệt...`);

  const results = [];
  let started = 0, alreadyRunning = 0, failed = 0;

  const batchSize = 5;
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);
    const promises = batch.map(async (p) => {
      const id = p.profileId;
      const result = await startBrowser(id);
      if (result.ok) {
        if (result.alreadyRunning) alreadyRunning++;
        else started++;
        results.push({ profileId: id, ok: true });
      } else {
        failed++;
        logErr(`  ${id}: ${result.error}`);
        results.push({ profileId: id, ok: false, error: result.error });
      }
    });
    await Promise.all(promises);
    process.stdout.write(`\r  Tiến độ: ${Math.min(i + batchSize, profiles.length)}/${profiles.length} (new: ${started}, ready: ${alreadyRunning}, fail: ${failed})`);
    if (i + batchSize < profiles.length) await delay(3000);
  }

  console.log('');
  if (alreadyRunning > 0) logInfo(`${alreadyRunning} browser đã chạy sẵn`);
  if (started > 0) logOk(`Đã khởi chạy ${started} browser mới`);
  if (failed > 0) logErr(`${failed} browser khởi chạy thất bại`);

  if (started > 0) {
    logWait('Đợi 5 giây cho browser load...');
    await delay(5000);
  }

  return results.filter(r => r.ok);
}

// ========== SCRIPT ==========

/**
 * Ensure a single browser is running for a worker.
 * Lightweight wrapper — no batch progress bars.
 */
async function ensureSingleBrowserRunning(profileId) {
  const result = await startBrowser(profileId);
  if (result.ok) {
    if (!result.alreadyRunning) {
      await delay(5000);
    }
    return { ok: true };
  }
  return { ok: false, error: result.error };
}

async function checkScriptExists() {
  try {
    const res = await httpReq('GET', `${API_BASE}/scripts/${SCRIPT_ID}`);
    return res.status === 200 && res.data.success;
  } catch (e) {
    return false;
  }
}

async function runBatchScript(profileIds, concurrency) {
  try {
    const res = await httpReq('POST', `${API_BASE}/scripts/${SCRIPT_ID}/run-batch`, {
      profileIds,
      concurrency
    });

    if (res.status === 200 && res.data.success) {
      const data = res.data.data;
      const running = data.filter(d => d.status === 'running').length;
      const errors = data.filter(d => d.status === 'error');

      if (errors.length > 0) {
        errors.forEach(e => logErr(`  Script error ${e.profileId}: ${e.error}`));
      }
      return { ok: true, running, errors: errors.length, data };
    }

    logErr(`Chạy batch thất bại: ${JSON.stringify(res.data).slice(0, 300)}`);
    return { ok: false };
  } catch (e) {
    logErr(`Chạy batch lỗi: ${e.message}`);
    return { ok: false };
  }
}

// ========== MONITOR & WAIT ==========

/**
 * Lấy logs mới từ một execution (chỉ log mới kể từ offset)
 */
async function fetchNewLogs(execId, offset) {
  try {
    const res = await httpReq('GET', `${API_BASE}/scripts/executions/${execId}/logs`);
    if (res.status === 200 && res.data.success) {
      const allLogs = res.data.data || [];
      return allLogs.slice(offset);
    }
  } catch (e) {}
  return [];
}

/**
 * Format profile ID ngắn gọn (8 ký tự đầu)
 */
function shortId(profileId) {
  return profileId.slice(0, 8);
}

/**
 * Lọc và format log quan trọng để hiển thị
 * 4 cấp độ:
 *   - 🚨 ALERT: CAPTCHA, Access Denied, lỗi nghiêm trọng (luôn hiện)
 *   - ✅ EVENT: Submit thành công (luôn hiện)
 *   - 🔧 ACTION: browser actions từ script (luôn hiện)
 *   - (ẩn): duplicate, skip, found → chỉ đếm, không in
 */
function formatLogLine(profileId, logEntry, workerIndex) {
  const msg = logEntry.message || '';
  const level = logEntry.level || 'info';
  const ts = new Date().toLocaleTimeString('vi-VN');
  const pName = profileNames[profileId] || shortId(profileId);
  const w = `W${workerIndex}|${pName}`;

  // ═══ ALERT: luôn hiện rõ ═══

  // CAPTCHA
  if (msg.includes('[CAPTCHA_BLOCKED]')) {
    return `[${ts}] 🚫 [${w}] CAPTCHA BLOCKED → sẽ đổi profile`;
  }
  if (msg.includes('CAPTCHA') && !msg.includes('[CAPTCHA_BLOCKED]')) {
    return `[${ts}] 🚫 [${w}] CAPTCHA detected`;
  }

  // Access Denied
  if (msg.includes('Access Denied') || msg.includes("don't have permission")) {
    return `[${ts}] 🚫 [${w}] ACCESS DENIED → sẽ đổi profile`;
  }

  // Region Blocked (TikTok không khả dụng ở khu vực này)
  if (msg.includes('[REGION_BLOCKED]')) {
    return `[${ts}] 🌍 [${w}] REGION BLOCKED → sẽ đổi profile`;
  }

  // Login Blocked (proxy bị yêu cầu login)
  if (msg.includes('[LOGIN_BLOCKED]')) {
    return `[${ts}] 🔒 [${w}] LOGIN BLOCKED → sẽ đổi profile`;
  }

  // Script error
  if (level === 'error' && msg.includes('Script error')) {
    return `[${ts}] 💥 [${w}] ${msg.slice(0, 100)}`;
  }

  // Error logs (FYP error, Explore error, Phase error)
  if (level === 'error') {
    return `[${ts}] ❌ [${w}] ${msg.slice(0, 100)}`;
  }

  // Login thất bại
  if (msg.includes('[API] Login lỗi') || msg.includes('[API] Login response')) {
    return `[${ts}] ⚠️  [${w}] API Login thất bại`;
  }

  // Submit thất bại (khác 409)
  if (msg.includes('[API] Submit') && msg.includes('HTTP') && !msg.includes('409')) {
    const match = msg.match(/Submit\s+(\d+)\s*→\s*HTTP\s*(\d+)/);
    if (match) return `[${ts}] ⚠️  [${w}] Submit ${match[1]} → HTTP ${match[2]}`;
  }

  // ═══ EVENT: submit thành công ═══
  if (msg.includes('[API] Submit OK')) {
    const musicId = msg.match(/Submit OK:\s*(\d+)/)?.[1] || '?';
    return `[${ts}] ✅ [${w}] SUBMIT ${musicId}`;
  }

  // ═══ FOUND: hiện musicId|count để verify ═══
  if (msg.startsWith('>> ')) {
    // Format: >> 1234567|50K (Song Name) [FYP] [>= 10000 → SUBMIT]
    //    hoặc: >> 1234567|500 (Song Name) [Explore] [500 < 10000 → skip]
    const m = msg.match(/^>> (\d+)\|(\S+)\s+\(([^)]*)\)\s+\[([^\]]+)\]\s+\[(.+)\]$/);
    if (m) {
      const [, id, count, name, source, verdict] = m;
      if (verdict.includes('SUBMIT')) {
        return `[${ts}] 📤 [${w}] ${id}|${count} (${name}) [${source}] → SUBMIT`;
      } else {
        return `[${ts}] 📝 [${w}] ${id}|${count} (${name}) [${source}] → skip`;
      }
    }
    // Fallback nếu format khác
    return `[${ts}] 📝 [${w}] ${msg.slice(3)}`;
  }

  // ═══ ACTION: browser actions ═══
  if (msg.includes('[ACTION]')) {
    const action = msg.replace('[ACTION]', '').trim();
    return `[${ts}] 🔧 [${w}] ${action}`;
  }

  // Phase header (PHASE: For You / Explore)
  if (msg.includes('PHASE:')) {
    const phase = msg.replace(/=+/g, '').trim();
    return `[${ts}] 📋 [${w}] ${phase}`;
  }

  // ═══ v5 format: [result] ★ #N | id=xxx | title="yyy" | videos=zzz | method=click ═══
  if (msg.includes('[result]')) {
    const m = msg.match(/id=(\d+).*?title="([^"]*)".*?videos=(\S+).*?method=(\S+)/);
    if (m) {
      const icon = m[4] === 'click' ? '🖱️' : '🔗';
      return `[${ts}] ★ [${w}] ${m[1]}|${m[3]} "${m[2].slice(0,30)}" ${icon}${m[4]}`;
    }
    return `[${ts}] ★ [${w}] ${msg.replace('[result]', '').trim().slice(0, 80)}`;
  }

  // v5: [click] navigate thành công
  if (msg.includes('[click]') && msg.includes('Navigate')) {
    return `[${ts}] 🖱️ [${w}] ${msg.replace('[click]', '').trim().slice(0, 70)}`;
  }

  // v5: [fallback] navigate thành công
  if (msg.includes('[fallback]') && msg.includes('Navigate')) {
    return `[${ts}] 🔗 [${w}] ${msg.replace('[fallback]', '').trim().slice(0, 70)}`;
  }

  // v5: [save] JSON saved
  if (msg.includes('[save]')) {
    return `[${ts}] 💾 [${w}] ${msg.replace('[save]', '').trim().slice(0, 60)}`;
  }

  // ═══ API: submit flow chi tiết ═══
  if (msg.includes('[API]')) {
    // Login kết quả
    if (msg.includes('Kết nối') || msg.includes('kết nối') || msg.includes('Đang kết nối')) {
      return `[${ts}] 🔌 [${w}] ${msg.replace('[API]', '').trim()}`;
    }
    if (msg.includes('Login OK') || msg.includes('Token OK') || msg.includes('✅')) {
      return `[${ts}] 🔑 [${w}] API Login thành công`;
    }
    if (msg.includes('Login lỗi') || msg.includes('Login thất bại') || msg.includes('Login response')) {
      return `[${ts}] ⚠️  [${w}] ${msg.replace('[API]', '').trim().slice(0, 80)}`;
    }
    // Submit quyết định
    if (msg.includes('→ SUBMIT') || msg.includes('SUBMIT')) {
      const m = msg.match(/(\d+)/);
      return `[${ts}] 📤 [${w}] ${m ? m[1] : '?'} → SUBMIT`;
    }
    if (msg.includes('→ skip')) {
      const m = msg.match(/(\d+)/);
      return `[${ts}] ⏭️  [${w}] ${m ? m[1] : '?'} → skip (video count thấp)`;
    }
    // Submit kết quả
    if (msg.includes('Submit OK')) {
      const musicId = msg.match(/Submit OK:\s*(\d+)/)?.[1] || '?';
      return `[${ts}] ✅ [${w}] SUBMITTED ${musicId}`;
    }
    if (msg.includes('Submit lỗi') || (msg.includes('Submit') && msg.includes('HTTP'))) {
      return `[${ts}] ❌ [${w}] ${msg.replace('[API]', '').trim().slice(0, 80)}`;
    }
    // Catch-all API logs
    return `[${ts}] 🔌 [${w}] ${msg.replace('[API]', '').trim().slice(0, 80)}`;
  }

  // v5: Video # header
  if (msg.includes('Video #')) {
    return `[${ts}] 📋 [${w}] ${msg.replace(/[══]/g, '').trim()}`;
  }

  // ═══ UI wait: chi tiết ═══
  if (msg.includes('[ui-wait]')) {
    if (msg.includes('Error page')) return `[${ts}] 🔄 [${w}] Error page → Refresh clicked`;
    if (msg.includes('reload')) return `[${ts}] 🔄 [${w}] ${msg.replace('[ui-wait]', '').trim()}`;
    if (msg.includes('Timeout')) return `[${ts}] ⏳ [${w}] ${msg.replace('[ui-wait]', '').trim()}`;
    return `[${ts}] ⏳ [${w}] ${msg.replace('[ui-wait]', '').trim()}`;
  }

  // ═══ Locate: tìm music target ═══
  if (msg.includes('[locate]')) {
    if (msg.includes('Không tìm')) return `[${ts}] ⚠️  [${w}] Music target not found`;
    if (msg.includes('Đang tìm')) return `[${ts}] 🔍 [${w}] Đang tìm music target...`;
    if (msg.includes('Tìm thấy')) {
      // [locate] Tìm thấy: method=data-e2e score=278 y=665 text="song name"
      const meth = msg.match(/method=(\S+)/)?.[1] || '?';
      const score = msg.match(/score=(\S+)/)?.[1] || '?';
      const text = msg.match(/text="([^"]*)"/)?.[1] || '';
      return `[${ts}] 🎯 [${w}] Found: ${meth} (score=${score}) "${text.slice(0, 30)}"`;
    }
    if (msg.includes('debug')) return `[${ts}] 🔍 [${w}] ${msg.replace('[locate]', '').trim().slice(0, 80)}`;
    return `[${ts}] 🔍 [${w}] ${msg.replace('[locate]', '').trim().slice(0, 60)}`;
  }

  // ═══ Action: click/fallback steps ═══
  if (msg.includes('[action]')) {
    return `[${ts}] 👆 [${w}] ${msg.replace('[action]', '').trim().slice(0, 60)}`;
  }

  // ═══ Debug extract: DOM dump khi video count fail ═══
  if (msg.includes('[debug-extract]')) {
    const clean = msg.replace('[debug-extract]', '').trim();
    return `[${ts}] 🔬 [${w}] ${clean.slice(0, 200)}`;
  }

  // ═══ Extract: đọc thông tin music page ═══
  if (msg.includes('[extract]')) {
    return `[${ts}] 📖 [${w}] ${msg.replace('[extract]', '').trim().slice(0, 70)}`;
  }

  // ═══ Popup: đóng popup ═══
  if (msg.includes('[popup]')) {
    const popupInfo = msg.replace('[popup]', '').trim();
    // Cookie/GDPR popups → icon khác (thông tin, không phải cảnh báo)
    if (popupInfo.includes('cookie') || popupInfo.includes('gdpr') || popupInfo.includes('banner')) {
      return `[${ts}] 🍪 [${w}] ${popupInfo}`;
    }
    if (popupInfo.includes('overlay')) {
      return `[${ts}] 🪟 [${w}] ${popupInfo}`;
    }
    return `[${ts}] 🚫 [${w}] Popup: ${popupInfo}`;
  }

  // Login redirect handling
  if (msg.includes('[login-redirect]') || msg.includes('[init] Bị redirect')) {
    return `[${ts}] 🔒 [${w}] ${msg.slice(0, 80)}`;
  }

  // ═══ Navigation: redirect/goback ═══
  if (msg.includes('[nav]')) {
    return `[${ts}] 🧭 [${w}] ${msg.replace('[nav]', '').trim().slice(0, 70)}`;
  }

  // ═══ Skip/duplicate ═══
  if (msg.includes('[skip]')) {
    return `[${ts}] ⏭️  [${w}] ${msg.replace('[skip]', '').trim().slice(0, 60)}`;
  }

  // ═══ Init ═══
  if (msg.includes('[init]')) {
    return `[${ts}] 🚀 [${w}] ${msg.replace('[init]', '').trim().slice(0, 60)}`;
  }

  // ═══ Click detail (viewport, coordinate) ═══
  if (msg.includes('[click]') && !msg.includes('Navigate')) {
    return `[${ts}] 👆 [${w}] ${msg.replace('[click]', '').trim().slice(0, 70)}`;
  }

  // ═══ Fallback detail ═══
  if (msg.includes('[fallback]') && !msg.includes('Navigate')) {
    return `[${ts}] 🔗 [${w}] ${msg.replace('[fallback]', '').trim().slice(0, 70)}`;
  }

  // ═══ Captcha ═══
  if (msg.includes('[captcha]')) {
    return `[${ts}] 🚫 [${w}] ${msg.replace('[captcha]', '').trim()}`;
  }

  // ═══ Summary / KẾT QUẢ ═══
  if (msg.includes('KẾT QUẢ') || msg.includes('═══')) {
    return `[${ts}] 📊 [${w}] ${msg.replace(/[═]/g, '').trim()}`;
  }

  // ═══ ẨN: chỉ các log không tag → ẩn ═══
  return null;
}

/**
 * Wait for a single profile's script execution to complete.
 * Polls GET /executions, filters to this profile, streams logs.
 * Returns { status, submitted, duplicate, skipped, videos, musicNotFound, isCaptcha }
 */
async function waitForMyCompletion(profileId, workerIndex) {
  const logOffsets = {};
  let submitted = 0;
  let duplicate = 0;
  let skipped = 0;
  let videos = 0;
  let musicNotFound = 0;
  let isCaptcha = false;

  while (!isShuttingDown) {
    try {
      const res = await httpReq('GET', `${API_BASE}/scripts/executions`);

      if (res.status === 200 && res.data.success) {
        // Find executions for THIS profile only
        const myExecs = res.data.data.filter(e =>
          e.profileId === profileId && e.scriptId === SCRIPT_ID
        );

        if (myExecs.length === 0) {
          await delay(WORKER_POLL_INTERVAL);
          continue;
        }

        // Get the most recent execution
        let latest = myExecs[0];
        for (const e of myExecs) {
          if (e.startedAt > latest.startedAt) latest = e;
        }

        // Fetch and process new logs
        if (!logOffsets[latest.id]) logOffsets[latest.id] = 0;
        const newLogs = await fetchNewLogs(latest.id, logOffsets[latest.id]);
        logOffsets[latest.id] += newLogs.length;

        for (const entry of newLogs) {
          const msg = entry.message || '';

          // v5 format counters
          if (msg.includes('[result]')) { /* result found, counted below */ }
          if (msg.includes('[skip] Music')) duplicate++;
          if (msg.includes('Video #')) videos++;
          if (msg.includes('[locate]') && msg.includes('Không tìm')) musicNotFound++;

          // API submit counters (v5 + combined)
          if (msg.includes('[API] ✅ Submit OK') || msg.includes('[API] Submit OK')) submitted++;
          if (msg.includes('HTTP 409')) duplicate++;
          if (msg.includes('→ skip')) skipped++;
          if (msg.includes('[API] Submit lỗi') || (msg.includes('[API] Submit') && msg.includes('HTTP') && !msg.includes('409'))) { /* error, logged */ }

          // combined_scraper format counters (backward compat)
          if (msg.includes('FYP #') || msg.includes('Explore #')) videos++;
          if (msg.includes('Không tìm thấy music link')) musicNotFound++;

          if (msg.includes('[CAPTCHA_BLOCKED]')) {
            isCaptcha = true;
          }

          // Access Denied = IP/profile bị chặn → cần đổi profile
          if (msg.includes('Access Denied') || msg.includes("don't have permission")) {
            isCaptcha = true;
          }

          // Region blocked = TikTok không khả dụng → đổi profile
          if (msg.includes('[REGION_BLOCKED]')) {
            isCaptcha = true;  // Reuse cùng flow thay thế profile
          }

          // Login blocked = proxy bị yêu cầu login → đổi profile
          if (msg.includes('[LOGIN_BLOCKED]')) {
            isCaptcha = true;  // Reuse cùng flow thay thế profile
          }

          const formatted = formatLogLine(profileId, entry, workerIndex);
          if (formatted) {
            console.log(formatted);
          }
        }

        // Check if done
        if (latest.status !== 'running') {
          return { status: latest.status, submitted, duplicate, skipped, videos, musicNotFound, isCaptcha };
        }
      }
    } catch (e) {
      // Server busy, ignore and retry
    }

    await delay(WORKER_POLL_INTERVAL);
  }

  // Shutdown interrupted — vẫn trả counters đã đếm được
  return { status: 'interrupted', submitted, duplicate, skipped, videos, musicNotFound, isCaptcha };
}

/**
 * Handle CAPTCHA replacement for a single worker.
 * Returns the new profileId, or null if replacement failed.
 */
async function handleMyCaptcha(oldProfileId, workerIndex) {
  logErr(`[W${workerIndex}] [${shortId(oldProfileId)}] Profile bị chặn! Đang thay thế...`);

  const newProfile = await replaceCaptchaProfile(oldProfileId);

  if (newProfile) {
    const newId = newProfile.profileId;
    profileNames[newId] = newProfile.name || `Profile_${newId}`;
    const idx = activeProfileIds.indexOf(oldProfileId);
    if (idx !== -1) {
      activeProfileIds[idx] = newId;
    } else {
      activeProfileIds.push(newId);
    }
    logOk(`[W${workerIndex}] CAPTCHA replaced: ${shortId(oldProfileId)} → ${shortId(newId)} (${profileNames[newId]})`);
    return newId;
  }

  activeProfileIds = activeProfileIds.filter(id => id !== oldProfileId);
  logErr(`[W${workerIndex}] CAPTCHA replace failed for ${shortId(oldProfileId)}. Worker stopping.`);
  return null;
}

/**
 * Independent worker loop for a single profile.
 * Runs indefinitely until isShuttingDown or unrecoverable error.
 */
async function runWorker(initialProfileId, workerIndex) {
  let myProfileId = initialProfileId;

  workerStats[workerIndex] = {
    profileId: myProfileId,
    status: 'starting',
    roundsCompleted: 0,
    lastSubmitted: 0,
    lastDuplicate: 0,
    lastSkipped: 0,
    lastError: null,
    lastCompletedAt: null
  };

  log(`[W${workerIndex}] Started — ${profileNames[myProfileId] || shortId(myProfileId)}`);

  while (!isShuttingDown) {
    try {
      // ── Step 1: Ensure browser is running ──
      workerStats[workerIndex].status = 'starting';
      workerStats[workerIndex].profileId = myProfileId;

      const browserOk = await ensureSingleBrowserRunning(myProfileId);
      if (!browserOk.ok) {
        workerStats[workerIndex].status = 'error';
        workerStats[workerIndex].lastError = browserOk.error || 'browser start failed';
        logErr(`[W${workerIndex}] Browser failed → retry 15s`);
        await delay(15000);
        continue;
      }

      if (isShuttingDown) break;

      // ── Step 2: Run script on this single profile ──
      workerStats[workerIndex].status = 'running';

      const runResult = await runBatchScript([myProfileId], 1);
      if (!runResult.ok) {
        workerStats[workerIndex].status = 'error';
        workerStats[workerIndex].lastError = 'run-batch failed';
        logErr(`[W${workerIndex}] Script start failed → retry 15s`);
        await delay(15000);
        continue;
      }

      if (isShuttingDown) break;

      // ── Step 3: Poll until MY execution completes ──
      workerStats[workerIndex].status = 'polling';
      const result = await waitForMyCompletion(myProfileId, workerIndex);

      // ── Step 4: Update stats (luôn cộng, kể cả khi shutting down) ──
      if (result) {
        totalSubmitted += result.submitted || 0;
        totalDuplicate += result.duplicate || 0;
        totalSkipped += result.skipped || 0;
        totalVideos += result.videos || 0;
        totalMusicNotFound += result.musicNotFound || 0;
      }

      if (isShuttingDown) break;

      workerStats[workerIndex].roundsCompleted++;
      if (result) {
        workerStats[workerIndex].lastSubmitted = result.submitted;
        workerStats[workerIndex].lastDuplicate = result.duplicate;
        workerStats[workerIndex].lastSkipped = result.skipped;
      }
      workerStats[workerIndex].lastCompletedAt = Date.now();
      workerStats[workerIndex].lastError = null;

      const r = workerStats[workerIndex].roundsCompleted;
      const rv = result ? result.videos || 0 : 0;
      const rm = result ? result.musicNotFound || 0 : 0;
      const rs = result ? result.submitted || 0 : 0;
      const rd = result ? result.duplicate || 0 : 0;
      const rk = result ? result.skipped || 0 : 0;
      const roundMissRate = rv > 0 ? ((rm / rv) * 100).toFixed(0) : '0';
      log(`[W${workerIndex}] Round ${r} done — ${rv}vids ${rm}miss(${roundMissRate}%) +${rs}sub ${rd}dup ${rk}skip`);

      // ── Step 5: Handle CAPTCHA / Access Denied ──
      if (result.isCaptcha) {
        workerStats[workerIndex].status = 'captcha';
        const newId = await handleMyCaptcha(myProfileId, workerIndex);
        if (!newId) {
          workerStats[workerIndex].status = 'stopped';
          return;
        }
        myProfileId = newId;
        workerStats[workerIndex].profileId = newId;
      }

      if (isShuttingDown) break;

      // ── Step 6: Short cooldown before next run ──
      workerStats[workerIndex].status = 'cooldown';
      await delay(WORKER_COOLDOWN);

    } catch (err) {
      workerStats[workerIndex].status = 'error';
      workerStats[workerIndex].lastError = err.message;
      logErr(`[W${workerIndex}] Error: ${err.message} → retry 30s`);
      await delay(30000);
    }
  }

  workerStats[workerIndex].status = 'stopped';
  log(`[W${workerIndex}] Stopped.`);
}

/**
 * Periodic display loop — in bảng trạng thái tất cả workers.
 * Chỉ in khi có thay đổi thực sự (rounds, submit, status), không spam.
 */
async function displayLoop() {
  let lastSnapshot = '';

  while (!isShuttingDown) {
    await delay(DISPLAY_INTERVAL);
    if (isShuttingDown) break;

    const stats = Object.entries(workerStats);
    if (stats.length === 0) continue;

    // Tổng hợp
    let sumRounds = 0, activeCount = 0, alertCount = 0;
    for (const [, s] of stats) {
      sumRounds += s.roundsCompleted;
      if (s.status !== 'stopped') activeCount++;
      if (s.status === 'captcha' || s.status === 'error') alertCount++;
    }

    // Tạo snapshot để so sánh — chỉ in khi có gì đổi
    const snapshot = `${sumRounds}|${totalSubmitted}|${totalDuplicate}|${totalSkipped}|${totalVideos}|${totalMusicNotFound}|${stats.map(([,s]) => s.status + s.roundsCompleted).join(',')}`;
    if (snapshot === lastSnapshot) continue; // Không đổi → skip
    lastSnapshot = snapshot;

    const ts = new Date().toLocaleTimeString('vi-VN');
    const uptime = formatUptime(Date.now() - startTime);

    // Header
    console.log('');
    const missRate = totalVideos > 0 ? ((totalMusicNotFound / totalVideos) * 100).toFixed(0) : '0';
    console.log(`  ┌─── ${ts} | Uptime: ${uptime} | Workers: ${activeCount}/${stats.length} | Rounds: ${sumRounds} | Vids: ${totalVideos} Miss: ${totalMusicNotFound}(${missRate}%) | Submit: ${totalSubmitted} Dup: ${totalDuplicate} Skip: ${totalSkipped} ───┐`);

    // Per-worker status (1 dòng/worker)
    for (const [idx, s] of stats) {
      const pName = profileNames[s.profileId] || shortId(s.profileId);
      let icon, statusText;
      switch (s.status) {
        case 'running': case 'polling':
          icon = '▶'; statusText = 'running'; break;
        case 'cooldown':
          icon = '⏸'; statusText = 'cooldown'; break;
        case 'captcha':
          icon = '🚫'; statusText = 'BLOCKED'; break;
        case 'error':
          icon = '❌'; statusText = `ERROR: ${(s.lastError || '').slice(0, 30)}`; break;
        case 'starting':
          icon = '🔄'; statusText = 'starting'; break;
        case 'stopped':
          icon = '⬛'; statusText = 'stopped'; break;
        default:
          icon = '?'; statusText = s.status;
      }
      const roundInfo = s.roundsCompleted > 0
        ? `R${s.roundsCompleted} | last: +${s.lastSubmitted}sub ${s.lastDuplicate}dup`
        : 'waiting...';
      console.log(`  │ ${icon} W${idx} [${pName}] ${statusText.padEnd(12)} ${roundInfo}`);
    }

    // Alert nổi bật nếu có vấn đề
    if (alertCount > 0) {
      console.log(`  │ ⚠️  ${alertCount} worker(s) cần chú ý!`);
    }
    console.log('  └' + '─'.repeat(70) + '┘');
  }
}

// ========== MAIN LOOP ==========

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   TikTok Music Scraper - Chạy Liên Tục          ║');
  console.log('║   Server → Profile → Browser → Script → Lặp ∞   ║');
  console.log('║   Dừng: Ctrl+C                                   ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // ── Lấy số luồng ──
  let threadCount;
  const argThreads = parseInt(process.argv[2]);
  const autoConfirm = process.argv.includes('--yes') || process.argv.includes('-y');

  if (argThreads > 0 && argThreads <= MAX_THREADS) {
    threadCount = argThreads;
  } else {
    const answer = await askQuestion(`Bạn muốn chạy bao nhiêu luồng? (1-${MAX_THREADS}): `);
    threadCount = parseInt(answer);
    if (isNaN(threadCount) || threadCount < 1 || threadCount > MAX_THREADS) {
      logErr(`Số luồng không hợp lệ. Phải từ 1 đến ${MAX_THREADS}.`);
      process.exit(1);
    }
  }

  logInfo(`Chế độ: CHẠY LIÊN TỤC với ${threadCount} luồng`);
  logInfo(`Worker model: mỗi profile chạy độc lập, cooldown ${WORKER_COOLDOWN / 1000}s`);
  console.log('');

  // ── Bước 1: Server ──
  console.log('━━━ Bước 1/4: Khởi động API Server ━━━');
  if (!await ensureServer()) process.exit(1);
  console.log('');

  // ── Bước 2: Kiểm tra script ──
  if (!await checkScriptExists()) {
    logErr(`Script "${SCRIPT_ID}" không tồn tại!`);
    process.exit(1);
  }
  logOk(`Script "${SCRIPT_ID}" sẵn sàng`);
  console.log('');

  // ── Bước 3: Chuẩn bị profile ──
  console.log('━━━ Bước 2/4: Chuẩn bị Profile ━━━');
  const profiles = await ensureProfiles(threadCount);
  if (profiles.length === 0) {
    logErr('Không có profile nào! Thoát.');
    process.exit(1);
  }
  threadCount = Math.min(threadCount, profiles.length);
  const selectedProfiles = profiles.slice(0, threadCount);
  const profileIds = selectedProfiles.map(p => p.profileId);
  // Populate profile name lookup
  for (const p of selectedProfiles) {
    profileNames[p.profileId] = p.name || `Profile_${p.profileId}`;
  }
  console.log('');

  // ── Bước 4: Khởi chạy browser ──
  console.log('━━━ Bước 3/4: Khởi chạy Browser ━━━');
  const startedBrowsers = await ensureBrowsersRunning(selectedProfiles);
  if (startedBrowsers.length === 0) {
    logErr('Không có browser nào khởi chạy được! Thoát.');
    process.exit(1);
  }
  activeProfileIds = startedBrowsers.map(b => b.profileId);
  threadCount = activeProfileIds.length;
  console.log('');

  // ── Confirm ──
  if (!autoConfirm) {
    const confirm = await askQuestion(`Sẵn sàng chạy LIÊN TỤC trên ${threadCount} luồng. Tiếp tục? (Y/n): `);
    if (confirm.toLowerCase() === 'n') {
      logInfo('Đã hủy.');
      process.exit(0);
    }
  }

  // ── Bước 4b: Login API tiktok 1 lần, share token cho tất cả workers ──
  const TIKTOK_API_BASE = 'http://toptop1917.ddns.net:5300';
  const TIKTOK_API_AUTH = { username: 'BotMiMi', password: '23TBdNfpgnCs@123' };
  const TOKEN_FILE = path.join(__dirname, 'data', '.api_token');
  try {
    logInfo('Đang login API TikTok (1 lần cho tất cả workers)...');
    const loginRes = await httpReq('POST', TIKTOK_API_BASE + '/api/auth/login', TIKTOK_API_AUTH);
    if (loginRes.status === 200 && loginRes.data) {
      const token = loginRes.data.token || loginRes.data.accessToken || (loginRes.data.data && loginRes.data.data.token) || null;
      if (token) {
        require('fs').writeFileSync(TOKEN_FILE, token, 'utf8');
        logOk('API login OK — token lưu file cho tất cả workers');
      } else {
        logInfo('API login response không có token, workers sẽ tự login');
      }
    }
  } catch (e) {
    logInfo('API login lỗi: ' + e.message + ' — workers sẽ tự login');
  }
  console.log('');

  // ══════════════════════════════════════
  //  SPAWN WORKERS (mỗi profile = 1 worker độc lập)
  // ══════════════════════════════════════
  console.log('');
  console.log('═'.repeat(60));
  logInfo(`BẮT ĐẦU WORKER MODEL - ${threadCount} workers - Ctrl+C để dừng`);
  console.log('═'.repeat(60));
  startTime = Date.now();

  // Spawn independent workers (stagger khởi động tránh nghẽn CPU)
  const workerPromises = [];
  for (let i = 0; i < activeProfileIds.length; i++) {
    const profileId = activeProfileIds[i];
    const idx = i;
    const staggerMs = i * WORKER_STAGGER_DELAY;
    workerPromises.push(
      (async () => {
        if (staggerMs > 0) {
          log(`[W${idx}] Chờ ${staggerMs / 1000}s trước khi khởi động...`);
          await delay(staggerMs);
        }
        return runWorker(profileId, idx);
      })()
    );
  }

  // Spawn display loop
  const displayPromise = displayLoop();

  // Wait for all workers to finish (they run until shutdown or failure)
  const results = await Promise.allSettled(workerPromises);

  // All workers exited — check if it's because all stopped (e.g. all CAPTCHA)
  const allStopped = Object.values(workerStats).every(w => w.status === 'stopped');
  if (allStopped && !isShuttingDown) {
    logErr('Tất cả worker đã dừng! Không còn profile nào hoạt động.');
  }

  isShuttingDown = true;
  await displayPromise;
}

// ========== SHUTDOWN ==========

/**
 * Dừng tất cả script execution đang chạy
 */
async function stopAllExecutions() {
  try {
    const res = await httpReq('GET', `${API_BASE}/scripts/executions`);
    if (res.status !== 200 || !res.data.success) return 0;

    const running = res.data.data.filter(e =>
      e.status === 'running' && e.scriptId === SCRIPT_ID
    );

    let stopped = 0;
    for (const exec of running) {
      try {
        await httpReq('POST', `${API_BASE}/scripts/executions/${exec.id}/stop`);
        stopped++;
      } catch (e) {}
    }
    return stopped;
  } catch (e) {
    return 0;
  }
}

/**
 * Tắt tất cả browser profile
 */
async function stopAllBrowsers(profileIds) {
  let stopped = 0;
  for (const id of profileIds) {
    try {
      const res = await httpReq('POST', `${API_BASE}/profiles/${id}/stop`);
      if (res.status === 200) stopped++;
    } catch (e) {}
  }
  return stopped;
}

/**
 * Kill API server process (port 3000)
 */
function killApiServer() {
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      // Tìm PID dùng port 3000 và kill
      const result = execSync('netstat -ano | findstr ":3000" | findstr "LISTENING"', { encoding: 'utf8', timeout: 5000 });
      const lines = result.trim().split('\n');
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid) && parseInt(pid) > 0) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid} /T`, { timeout: 5000 });
        } catch (e) {}
      }
      return pids.size;
    } else {
      execSync('kill $(lsof -t -i:3000) 2>/dev/null', { timeout: 5000 });
      return 1;
    }
  } catch (e) {
    return 0;
  }
}

/**
 * Graceful shutdown: stop scripts → stop browsers → kill server
 */
async function gracefulShutdown() {
  console.log('');
  console.log('');
  console.log('═'.repeat(60));
  logInfo('ĐANG TẮT TẤT CẢ... (Ctrl+C lần nữa = force quit)');
  console.log('═'.repeat(60));
  console.log('');

  // 1. Stop script executions
  logWait('Dừng các script đang chạy...');
  const stoppedExecs = await stopAllExecutions();
  if (stoppedExecs > 0) {
    logOk(`Đã dừng ${stoppedExecs} script execution`);
  } else {
    logInfo('Không có script nào đang chạy');
  }

  // 2. Stop browsers
  if (activeProfileIds.length > 0) {
    logWait(`Đang tắt ${activeProfileIds.length} browser...`);
    const stoppedBrowsers = await stopAllBrowsers(activeProfileIds);
    logOk(`Đã tắt ${stoppedBrowsers}/${activeProfileIds.length} browser`);
  }

  // 3. Kill API server
  logWait('Đang tắt API server...');
  const killed = killApiServer();
  if (killed > 0) {
    logOk('Đã tắt API server');
  } else {
    logInfo('API server đã tắt hoặc không tìm thấy');
  }

  // Summary
  console.log('');
  console.log('─'.repeat(60));
  const totalRounds = Object.values(workerStats).reduce((s, w) => s + w.roundsCompleted, 0);
  const activeWorkers = Object.values(workerStats).filter(w => w.status !== 'stopped').length;
  logInfo(`Tổng vòng đã chạy (all workers): ${totalRounds}`);
  logInfo(`Tổng videos đã lướt: ${totalVideos}`);
  logInfo(`Tổng music không thấy: ${totalMusicNotFound}`);
  const finalMissRate = totalVideos > 0 ? ((totalMusicNotFound / totalVideos) * 100).toFixed(1) : '0';
  const finalFindRate = totalVideos > 0 ? (((totalSubmitted + totalDuplicate + totalSkipped) / totalVideos) * 100).toFixed(1) : '0';
  logInfo(`Tỷ lệ miss: ${finalMissRate}% | Tỷ lệ tìm thấy music: ${finalFindRate}%`);
  logInfo(`Tổng submitted: ${totalSubmitted}`);
  logInfo(`Tổng duplicate: ${totalDuplicate}`);
  logInfo(`Tổng skipped: ${totalSkipped}`);
  logInfo(`Workers còn active khi shutdown: ${activeWorkers}`);
  logInfo(`Tổng uptime: ${formatUptime(Date.now() - startTime)}`);
  console.log('─'.repeat(60));
  logOk('Đã tắt sạch. Tạm biệt!');
  console.log('');

  process.exit(0);
}

process.on('SIGINT', () => {
  if (isShuttingDown) {
    console.log('\nForce exit!');
    process.exit(1);
  }

  isShuttingDown = true;
  gracefulShutdown().catch(() => process.exit(1));
});

main().catch(err => {
  logErr(`Lỗi không mong đợi: ${err.message}`);
  console.error(err);
  process.exit(1);
});
