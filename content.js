(function () {
  'use strict';

  // Prevent duplicate injection on SPA navigation
  if (document.getElementById('yt-summarizer-sidebar')) return;

  // --- State ---
  const summaryCache = {};

  // Migrate old storage keys to new format
  const OLD_KEYS = ['anthropicApiKey', 'openaiApiKey', 'openaiBaseUrl', 'openaiModel'];
  const ALL_KEYS = ['provider', 'apiKey', 'model', 'baseUrl', ...OLD_KEYS];

  function getConfig(callback) {
    chrome.storage.local.get(ALL_KEYS, (result) => {
      // If new keys exist, use them directly
      if (result.apiKey) {
        callback(result);
        return;
      }
      // Migrate old keys → new keys
      if (result.anthropicApiKey || result.openaiApiKey) {
        const migrated = { provider: result.provider || 'anthropic' };
        if (result.provider === 'openai') {
          migrated.apiKey = result.openaiApiKey;
          migrated.baseUrl = result.openaiBaseUrl;
          migrated.model = result.openaiModel || 'kimi-k2-0905-preview';
        } else {
          migrated.apiKey = result.anthropicApiKey;
          migrated.model = 'claude-sonnet-4-20250514';
        }
        chrome.storage.local.set(migrated, () => {
          chrome.storage.local.remove(OLD_KEYS, () => {
            callback(migrated);
          });
        });
        return;
      }
      // No config at all
      callback(result);
    });
  }

  // --- Create Sidebar DOM ---
  function createSidebar() {
    const sidebar = document.createElement('div');
    sidebar.id = 'yt-summarizer-sidebar';
    sidebar.innerHTML = `
      <div class="yts-header">
        <span class="yts-title">Video Summary</span>
        <button id="yts-close-btn" title="Close sidebar">&times;</button>
      </div>
      <div class="yts-body">
        <div id="yts-api-key-section">
          <p id="yts-config-status" style="margin:0 0 6px;font-size:12px;color:#aaa;">No API key saved. Configure in the extension popup.</p>
          <button id="yts-clear-key-btn" class="yts-link-btn"
                  style="display:none;">Clear saved config</button>
        </div>
        <hr class="yts-divider" />
        <button id="yts-summarize-btn" disabled>Summarize This Video</button>
        <div id="yts-loading" style="display:none;">
          <div class="yts-spinner"></div>
          <span>Generating summary...</span>
        </div>
        <div id="yts-error" style="display:none;"></div>
        <div id="yts-summary" style="display:none;"></div>
      </div>
    `;
    document.body.appendChild(sidebar);

    const toggle = document.createElement('button');
    toggle.id = 'yts-toggle-btn';
    toggle.innerHTML = '&#x1f4dd;';
    toggle.title = 'Toggle Video Summary';
    document.body.appendChild(toggle);

    return { sidebar, toggle };
  }

  // --- UI Helpers ---
  function showLoading(visible) {
    document.getElementById('yts-loading').style.display = visible ? 'flex' : 'none';
    document.getElementById('yts-summarize-btn').disabled = visible;
  }

  function showError(msg) {
    const el = document.getElementById('yts-error');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function clearError() {
    const el = document.getElementById('yts-error');
    el.textContent = '';
    el.style.display = 'none';
  }

  function showSummary(markdownText) {
    const el = document.getElementById('yts-summary');
    el.innerHTML = renderMarkdown(markdownText);
    el.style.display = 'block';
  }

  function clearSummary() {
    const el = document.getElementById('yts-summary');
    el.innerHTML = '';
    el.style.display = 'none';
  }

  /**
   * Simple markdown to HTML renderer.
   * Handles: bold, headings (h2-h4), unordered lists, paragraphs.
   */
  function renderMarkdown(md) {
    // Escape HTML
    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headings
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // List items — group consecutive lines starting with "- "
    html = html.replace(
      /(^- .+$(\n^- .+$)*)/gm,
      function (block) {
        const items = block
          .split('\n')
          .map((line) => '<li>' + line.replace(/^- /, '') + '</li>')
          .join('');
        return '<ul>' + items + '</ul>';
      }
    );

    // Numbered list items
    html = html.replace(
      /(^\d+\. .+$(\n^\d+\. .+$)*)/gm,
      function (block) {
        const items = block
          .split('\n')
          .map((line) => '<li>' + line.replace(/^\d+\. /, '') + '</li>')
          .join('');
        return '<ol>' + items + '</ol>';
      }
    );

    // Paragraphs: convert double newlines to paragraph breaks
    html = html
      .split(/\n{2,}/)
      .map((block) => {
        block = block.trim();
        if (!block) return '';
        // Don't wrap blocks that are already HTML elements
        if (/^<(h[2-4]|ul|ol|li|p)/.test(block)) return block;
        return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
      })
      .join('');

    return html;
  }

  // --- Event Wiring ---
  function init() {
    const { sidebar, toggle } = createSidebar();

    // Toggle sidebar
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('yts-open');
    });

    document.getElementById('yts-close-btn').addEventListener('click', () => {
      sidebar.classList.remove('yts-open');
    });

    // Load saved config status
    function refreshConfigStatus() {
      getConfig((result) => {
        const statusEl = document.getElementById('yts-config-status');
        const clearBtn = document.getElementById('yts-clear-key-btn');
        const summarizeBtn = document.getElementById('yts-summarize-btn');

        const hasConfig = result.provider && result.apiKey;

        if (hasConfig) {
          const label = result.provider === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible';
          statusEl.textContent = `Using ${label} API \u2713`;
          statusEl.style.color = '#4caf50';
          clearBtn.style.display = 'block';
          summarizeBtn.disabled = false;
        } else {
          statusEl.textContent = 'No API key saved. Configure in the extension popup.';
          statusEl.style.color = '#aaa';
          clearBtn.style.display = 'none';
          summarizeBtn.disabled = true;
        }
      });
    }

    refreshConfigStatus();

    // Clear config
    document.getElementById('yts-clear-key-btn').addEventListener('click', () => {
      chrome.storage.local.remove(
        ['provider', 'apiKey', 'model', 'baseUrl'],
        refreshConfigStatus
      );
    });

    // Summarize button
    document.getElementById('yts-summarize-btn').addEventListener('click', async () => {
      const videoId = getVideoId();
      if (!videoId) {
        showError('Could not detect video ID from URL.');
        return;
      }

      // Check cache
      if (summaryCache[videoId]) {
        showSummary(summaryCache[videoId]);
        return;
      }

      showLoading(true);
      clearError();
      clearSummary();

      try {
        const stored = await new Promise((resolve) => getConfig(resolve));

        if (!stored.provider || !stored.apiKey) {
          throw new Error('Please configure your API key in the extension popup.');
        }

        const config = {
          provider: stored.provider,
          apiKey: stored.apiKey,
          model: stored.model,
          baseUrl: stored.baseUrl,
        };

        const transcript = await fetchTranscript(videoId);
        const summary = await summarizeTranscript(config, transcript);

        summaryCache[videoId] = summary;
        showSummary(summary);
      } catch (err) {
        showError(err.message);
      } finally {
        showLoading(false);
      }
    });

    // Handle YouTube SPA navigation
    let lastVideoId = getVideoId();
    document.addEventListener('yt-navigate-finish', () => {
      const newVideoId = getVideoId();
      if (newVideoId && newVideoId !== lastVideoId) {
        lastVideoId = newVideoId;
        clearSummary();
        clearError();
        refreshConfigStatus();
      }
    });
  }

  // Run
  init();
})();
