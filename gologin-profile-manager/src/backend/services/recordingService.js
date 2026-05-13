/**
 * Recording Service - Capture browser actions và generate Puppeteer code
 */

const puppeteer = require('puppeteer-core');
const ProcessManager = require('../utils/processManager');
const logger = require('../../../logger');

class RecordingService {
  // profileId -> { events, browser, page, status }
  static recordings = new Map();

  /**
   * Bắt đầu recording trên profile đang chạy
   */
  static async startRecording(profileId) {
    if (this.recordings.has(profileId)) {
      throw new Error('Already recording on this profile');
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

      const recording = {
        events: [],
        browser,
        page,
        status: 'recording',
        startedAt: Date.now()
      };

      this.recordings.set(profileId, recording);

      // Inject recording script vào tất cả các page mới
      await page.evaluateOnNewDocument(this._getInjectedScript());

      // Inject vào page hiện tại
      await page.evaluate(this._getInjectedScript());

      // Capture initial URL
      const currentUrl = page.url();
      if (currentUrl && currentUrl !== 'about:blank') {
        recording.events.push({
          type: 'navigate',
          url: currentUrl,
          timestamp: Date.now()
        });
      }

      // Listen console messages từ injected script
      page.on('console', (msg) => {
        const text = msg.text();
        if (text.startsWith('__RECORD__:')) {
          try {
            const eventData = JSON.parse(text.substring('__RECORD__:'.length));
            const rec = this.recordings.get(profileId);
            if (rec && rec.status === 'recording') {
              eventData.timestamp = Date.now();
              rec.events.push(eventData);
              logger.info(`[Recording] Event captured: ${eventData.type} on ${profileId}`);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      });

      // Capture navigation events
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
          const rec = this.recordings.get(profileId);
          if (rec && rec.status === 'recording') {
            const url = frame.url();
            // Avoid duplicate navigate events
            const lastEvent = rec.events[rec.events.length - 1];
            if (!lastEvent || lastEvent.type !== 'navigate' || lastEvent.url !== url) {
              rec.events.push({
                type: 'navigate',
                url: url,
                timestamp: Date.now()
              });
            }
          }
        }
      });

      logger.info(`[Recording] Started recording on profile ${profileId}`);
      return { status: 'recording', profileId };

    } catch (error) {
      // Cleanup on error
      if (browser) {
        try { browser.disconnect(); } catch (e) { /* ignore */ }
      }
      this.recordings.delete(profileId);
      throw error;
    }
  }

  /**
   * Dừng recording và trả về generated code
   */
  static async stopRecording(profileId) {
    const recording = this.recordings.get(profileId);
    if (!recording) {
      throw new Error('No active recording for this profile');
    }

    recording.status = 'stopped';

    // Disconnect browser (không đóng)
    try {
      if (recording.browser) {
        recording.browser.disconnect();
      }
    } catch (e) {
      // Ignore disconnect errors
    }

    const events = recording.events;
    const code = this.generateCode(events);

    this.recordings.delete(profileId);

    logger.info(`[Recording] Stopped recording on profile ${profileId}, ${events.length} events captured`);

    return {
      code,
      eventCount: events.length,
      profileId
    };
  }

  /**
   * Lấy status recording
   */
  static getStatus(profileId) {
    const recording = this.recordings.get(profileId);
    if (!recording) {
      return { status: 'idle', eventCount: 0 };
    }
    return {
      status: recording.status,
      eventCount: recording.events.length
    };
  }

  /**
   * Convert events array thành Puppeteer code
   */
  static generateCode(events) {
    if (events.length === 0) {
      return '// No actions were recorded\nlogger.info("No actions recorded");';
    }

    const lines = [];
    lines.push('// Auto-generated script from recording');
    lines.push('// Review and adjust selectors if needed\n');

    let lastTimestamp = null;

    for (const event of events) {
      // Insert sleep for gaps > 1 second
      if (lastTimestamp && event.timestamp) {
        const gap = event.timestamp - lastTimestamp;
        if (gap > 1000) {
          const sleepMs = Math.min(Math.round(gap / 100) * 100, 5000); // Round, cap at 5s
          lines.push(`await sleep(${sleepMs});`);
        }
      }
      lastTimestamp = event.timestamp;

      switch (event.type) {
        case 'navigate':
          lines.push(`await page.goto('${this._escapeString(event.url)}', { waitUntil: 'networkidle2' });`);
          break;

        case 'click':
          lines.push(`await page.click('${this._escapeString(event.selector)}');`);
          break;

        case 'type':
          // Group consecutive type events on same selector
          lines.push(`await page.type('${this._escapeString(event.selector)}', '${this._escapeString(event.value || '')}', { delay: 50 });`);
          break;

        case 'select':
          lines.push(`await page.select('${this._escapeString(event.selector)}', '${this._escapeString(event.value || '')}');`);
          break;

        case 'submit':
          lines.push(`await page.click('${this._escapeString(event.selector)}');`);
          lines.push(`await sleep(1000);`);
          break;

        default:
          lines.push(`// Unknown event: ${event.type}`);
      }
    }

    lines.push('\nlogger.info("Recording playback completed");');

    return lines.join('\n');
  }

  /**
   * Script được inject vào page để capture events
   */
  static _getInjectedScript() {
    return `(function() {
  if (window.__RECORDER_INJECTED__) return;
  window.__RECORDER_INJECTED__ = true;

  function getSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';

    // 1. ID
    if (el.id) return '#' + CSS.escape(el.id);

    // 2. name attribute
    if (el.name) {
      var byName = document.querySelectorAll('[name="' + CSS.escape(el.name) + '"]');
      if (byName.length === 1) return '[name="' + el.name + '"]';
    }

    // 3. Unique class
    if (el.className && typeof el.className === 'string') {
      var classes = el.className.trim().split(/\\s+/).filter(function(c) { return c.length > 0; });
      for (var i = 0; i < classes.length; i++) {
        var sel = '.' + CSS.escape(classes[i]);
        try {
          if (document.querySelectorAll(sel).length === 1) return sel;
        } catch(e) {}
      }
    }

    // 4. Tag + nth-of-type path
    var path = [];
    var current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      var tag = current.tagName.toLowerCase();
      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === current.tagName; });
        if (siblings.length > 1) {
          var index = siblings.indexOf(current) + 1;
          path.unshift(tag + ':nth-of-type(' + index + ')');
        } else {
          path.unshift(tag);
        }
      } else {
        path.unshift(tag);
      }
      current = parent;
    }
    return path.join(' > ');
  }

  function sendEvent(data) {
    console.log('__RECORD__:' + JSON.stringify(data));
  }

  // Click events
  document.addEventListener('click', function(e) {
    var selector = getSelector(e.target);
    sendEvent({ type: 'click', selector: selector });
  }, true);

  // Input/change events (for typing)
  document.addEventListener('input', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      var selector = getSelector(e.target);
      // Debounce: only send final value
      clearTimeout(e.target.__recordTimer__);
      e.target.__recordTimer__ = setTimeout(function() {
        sendEvent({ type: 'type', selector: selector, value: e.target.value });
      }, 500);
    }
  }, true);

  // Change events (for select)
  document.addEventListener('change', function(e) {
    if (e.target.tagName === 'SELECT') {
      var selector = getSelector(e.target);
      sendEvent({ type: 'select', selector: selector, value: e.target.value });
    }
  }, true);

  // Submit events
  document.addEventListener('submit', function(e) {
    var selector = getSelector(e.target);
    sendEvent({ type: 'submit', selector: selector });
  }, true);
})();`;
  }

  /**
   * Escape string cho code generation
   */
  static _escapeString(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  }
}

module.exports = RecordingService;
