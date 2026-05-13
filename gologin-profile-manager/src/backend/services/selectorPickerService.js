/**
 * Selector Picker Service - Inject picker vào browser để user chọn element
 * Trả về CSS selector + XPath của element được click
 */

const puppeteer = require('puppeteer-core');
const ProcessManager = require('../utils/processManager');
const logger = require('../../../logger');

class SelectorPickerService {
  // profileId -> { browser, page, resolve, status }
  static pickers = new Map();

  /**
   * Bắt đầu picker mode trên profile đang chạy
   * Inject highlight script, đợi user click element, trả về selectors
   */
  static async startPicker(profileId) {
    if (this.pickers.has(profileId)) {
      throw new Error('Picker already active on this profile');
    }

    if (!ProcessManager.isRunning(profileId)) {
      throw new Error('Profile is not running. Start the browser first.');
    }

    const debugPort = ProcessManager.getDebugPort(profileId);
    if (!debugPort) {
      throw new Error('Profile has no debug port. Restart the browser.');
    }

    let browser = null;
    try {
      browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${debugPort}`,
        defaultViewport: null
      });

      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();

      // Tạo promise sẽ resolve khi user click element
      let resolveResult;
      const resultPromise = new Promise((resolve) => {
        resolveResult = resolve;
      });

      this.pickers.set(profileId, {
        browser,
        page,
        resolve: resolveResult,
        status: 'picking'
      });

      // Inject picker script
      await page.evaluate(this._getPickerScript());

      // Listen console cho kết quả pick
      const consoleHandler = (msg) => {
        const text = msg.text();
        if (text.startsWith('__PICKER_RESULT__:')) {
          try {
            const data = JSON.parse(text.substring('__PICKER_RESULT__:'.length));
            resolveResult(data);
          } catch (e) {
            // ignore
          }
        } else if (text === '__PICKER_CANCEL__') {
          resolveResult(null);
        }
      };

      page.on('console', consoleHandler);

      logger.info(`[SelectorPicker] Picker started on profile ${profileId}`);

      // Đợi user click (timeout 60s)
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(null), 60000);
      });

      const result = await Promise.race([resultPromise, timeoutPromise]);

      // Cleanup
      page.off('console', consoleHandler);

      // Remove picker overlay
      try {
        await page.evaluate(() => {
          if (window.__pickerCleanup__) window.__pickerCleanup__();
        });
      } catch (e) { /* page may have navigated */ }

      try { browser.disconnect(); } catch (e) { /* ignore */ }
      this.pickers.delete(profileId);

      if (!result) {
        logger.info(`[SelectorPicker] Picker cancelled/timeout on profile ${profileId}`);
        return { cancelled: true };
      }

      logger.info(`[SelectorPicker] Picked: css=${result.cssSelector}, xpath=${result.xpath}`);
      return result;

    } catch (error) {
      if (browser) {
        try { browser.disconnect(); } catch (e) { /* ignore */ }
      }
      this.pickers.delete(profileId);
      throw error;
    }
  }

  /**
   * Hủy picker đang active
   */
  static async cancelPicker(profileId) {
    const picker = this.pickers.get(profileId);
    if (!picker) return false;

    try {
      await picker.page.evaluate(() => {
        if (window.__pickerCleanup__) window.__pickerCleanup__();
      });
    } catch (e) { /* ignore */ }

    picker.resolve(null);

    try { picker.browser.disconnect(); } catch (e) { /* ignore */ }
    this.pickers.delete(profileId);
    return true;
  }

  /**
   * Script inject vào page - highlight on hover, pick on click
   */
  static _getPickerScript() {
    return `(function() {
  // Prevent double inject
  if (window.__pickerActive__) return;
  window.__pickerActive__ = true;

  // Overlay chặn click bình thường
  var overlay = document.createElement('div');
  overlay.id = '__picker_overlay__';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;cursor:crosshair;';
  document.body.appendChild(overlay);

  // Highlight box
  var highlight = document.createElement('div');
  highlight.id = '__picker_highlight__';
  highlight.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #e74c3c;background:rgba(231,76,60,0.15);transition:all 0.05s;display:none;';
  document.body.appendChild(highlight);

  // Info tooltip
  var info = document.createElement('div');
  info.id = '__picker_info__';
  info.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:#1a1a2e;color:#e4e4e4;padding:6px 10px;border-radius:4px;font:12px monospace;max-width:500px;word-break:break-all;white-space:pre-wrap;box-shadow:0 2px 8px rgba(0,0,0,0.5);display:none;';
  document.body.appendChild(info);

  // ESC hint
  var hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;background:#e74c3c;color:white;padding:8px 16px;border-radius:6px;font:13px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.4);';
  hint.textContent = 'Click an element to pick its selector. Press ESC to cancel.';
  document.body.appendChild(hint);

  var lastTarget = null;

  function getCssSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';

    // 1. ID (ngắn nhất, chính xác nhất)
    if (el.id) return '#' + CSS.escape(el.id);

    // 2. name attribute
    if (el.getAttribute('name')) {
      var name = el.getAttribute('name');
      var byName = document.querySelectorAll('[name="' + CSS.escape(name) + '"]');
      if (byName.length === 1) return '[name="' + name + '"]';
    }

    // 3. data-testid, data-id, aria-label (phổ biến trong modern apps)
    var dataAttrs = ['data-testid', 'data-id', 'data-cy', 'data-test', 'aria-label'];
    for (var i = 0; i < dataAttrs.length; i++) {
      var val = el.getAttribute(dataAttrs[i]);
      if (val) {
        var sel = '[' + dataAttrs[i] + '="' + CSS.escape(val) + '"]';
        try { if (document.querySelectorAll(sel).length === 1) return sel; } catch(e) {}
      }
    }

    // 4. Tag + unique class combination
    if (el.className && typeof el.className === 'string') {
      var classes = el.className.trim().split(/\\s+/).filter(function(c) { return c.length > 0 && !/^[0-9]/.test(c); });
      // Try single class
      for (var i = 0; i < classes.length; i++) {
        var sel = el.tagName.toLowerCase() + '.' + CSS.escape(classes[i]);
        try { if (document.querySelectorAll(sel).length === 1) return sel; } catch(e) {}
      }
      // Try class only
      for (var i = 0; i < classes.length; i++) {
        var sel = '.' + CSS.escape(classes[i]);
        try { if (document.querySelectorAll(sel).length === 1) return sel; } catch(e) {}
      }
    }

    // 5. Tag + text content (cho buttons, links)
    if ((el.tagName === 'A' || el.tagName === 'BUTTON') && el.textContent.trim().length > 0 && el.textContent.trim().length < 50) {
      // Use XPath-style matching - nhưng trả về CSS fallback
    }

    // 6. Build shortest unique path lên parent
    var path = [];
    var current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      var tag = current.tagName.toLowerCase();
      var segment = tag;

      // Thử thêm class để unique
      if (current.className && typeof current.className === 'string') {
        var cls = current.className.trim().split(/\\s+/).filter(function(c) { return c.length > 0 && !/^[0-9]/.test(c); });
        if (cls.length > 0) {
          segment = tag + '.' + CSS.escape(cls[0]);
        }
      }

      // nth-of-type nếu cần
      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === current.tagName; });
        if (siblings.length > 1) {
          var idx = siblings.indexOf(current) + 1;
          segment = tag + ':nth-of-type(' + idx + ')';
        }
      }

      path.unshift(segment);

      // Kiểm tra nếu path hiện tại đã unique
      var testSel = path.join(' > ');
      try {
        if (document.querySelectorAll(testSel).length === 1) return testSel;
      } catch(e) {}

      current = parent;
    }

    return path.join(' > ');
  }

  function getXPath(el) {
    if (!el) return '';
    if (el === document.body) return '/html/body';

    // 1. ID shortcut
    if (el.id) return '//*[@id="' + el.id + '"]';

    // 2. Build path
    var parts = [];
    var current = el;
    while (current && current.nodeType === 1) {
      var tag = current.tagName.toLowerCase();
      var parent = current.parentNode;
      if (!parent) { parts.unshift(tag); break; }

      var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === current.tagName; });
      if (siblings.length > 1) {
        var idx = siblings.indexOf(current) + 1;
        parts.unshift(tag + '[' + idx + ']');
      } else {
        parts.unshift(tag);
      }
      current = parent;
    }
    return '/' + parts.join('/');
  }

  function getElementInfo(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id ? '#' + el.id : '';
    var cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '';
    var text = el.textContent ? el.textContent.trim().substring(0, 40) : '';
    return tag + id + cls + (text ? ' "' + text + '"' : '');
  }

  overlay.addEventListener('mousemove', function(e) {
    // Tạm ẩn overlay để lấy element bên dưới
    overlay.style.display = 'none';
    var target = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.display = '';

    if (!target || target === highlight || target === info || target === hint) return;
    if (target === lastTarget) return;
    lastTarget = target;

    var rect = target.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';

    var css = getCssSelector(target);
    var xpath = getXPath(target);
    info.style.display = 'block';
    info.innerHTML = '<b>CSS:</b> ' + css + '\\n<b>XPath:</b> ' + xpath + '\\n<b>Tag:</b> ' + getElementInfo(target);

    // Position info tooltip
    var infoY = rect.bottom + 8;
    if (infoY + 80 > window.innerHeight) infoY = rect.top - 80;
    if (infoY < 0) infoY = 8;
    info.style.left = Math.min(rect.left, window.innerWidth - 400) + 'px';
    info.style.top = infoY + 'px';
  }, true);

  overlay.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();

    overlay.style.display = 'none';
    var target = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.display = '';

    if (!target || target === highlight || target === info || target === hint) return;

    var cssSelector = getCssSelector(target);
    var xpath = getXPath(target);
    var tagName = target.tagName.toLowerCase();
    var text = target.textContent ? target.textContent.trim().substring(0, 100) : '';

    console.log('__PICKER_RESULT__:' + JSON.stringify({
      cssSelector: cssSelector,
      xpath: xpath,
      tagName: tagName,
      text: text
    }));
  }, true);

  // ESC to cancel
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      console.log('__PICKER_CANCEL__');
    }
  }
  document.addEventListener('keydown', onKeyDown, true);

  // Cleanup function
  window.__pickerCleanup__ = function() {
    overlay.remove();
    highlight.remove();
    info.remove();
    hint.remove();
    document.removeEventListener('keydown', onKeyDown, true);
    window.__pickerActive__ = false;
    window.__pickerCleanup__ = null;
  };
})();`;
  }
}

module.exports = SelectorPickerService;
