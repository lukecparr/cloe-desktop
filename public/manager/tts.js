// ==================== Cloe Settings — TTS Tab ====================

const API_TTS_BASE = 'http://127.0.0.1:19851';

// Provider field definitions — drives the dynamic form
const PROVIDER_FIELDS = {
  openai: [
    { key: 'api_key',   label: { zh: 'API Key',       en: 'API Key' },       type: 'password', placeholder: 'sk-...' },
    { key: 'base_url',  label: { zh: 'Base URL',      en: 'Base URL' },      type: 'text',     placeholder: 'https://api.openai.com/v1 (compatible with Azure/proxy/local)' },
    { key: 'model',     label: { zh: 'Model',          en: 'Model' },         type: 'text',     placeholder: 'tts-1' },
    { key: 'voice',     label: { zh: 'Voice',          en: 'Voice' },         type: 'text',     placeholder: 'alloy / nova / shimmer' },
    { key: 'instructions', label: { zh: 'Instructions (optional)', en: 'Instructions (optional)' }, type: 'text', placeholder: 'Speak in a warm, friendly tone' },
  ],
  mosi: [
    { key: 'api_key',   label: { zh: 'API Key',       en: 'API Key' },       type: 'password', placeholder: 'sk-...' },
    { key: 'voice_id',  label: { zh: 'Voice ID',      en: 'Voice ID' },      type: 'text',     placeholder: '2036257587296473088' },
    { key: 'url',       label: { zh: 'API URL',       en: 'API URL' },       type: 'text',     placeholder: 'https://studio.mosi.cn/v1/audio/tts' },
  ],
};

const PROVIDER_LABELS = {
  openai: { zh: 'OpenAI Compatible (OpenAI / Azure / Proxy)', en: 'OpenAI Compatible (OpenAI / Azure / Proxy)' },
  mosi:   { zh: 'MOSI', en: 'MOSI' },
};

function initTtsTab() {
  renderTts();
}

function renderTts() {
  const container = document.getElementById('tts-content');
  if (!container) return;

  const isZh = (typeof I18n !== 'undefined' && I18n.getLocale()?.startsWith('zh')) || document.documentElement.lang?.startsWith('zh');
  const t = (zh, en) => (isZh ? zh : en);

  container.innerHTML = `
    <div class="pref-section">
      <h2 class="pref-section-title">${t('Text-to-Speech (TTS)', 'Text-to-Speech (TTS)')}</h2>
      <div class="pref-group">
        <div class="pref-item">
          <div class="pref-info">
            <div class="pref-label">${t('TTS Provider', 'TTS Provider')}</div>
            <div class="pref-desc">${t('Choose a TTS provider. Config saved to ~/.cloe/tts-config.json', 'Choose a TTS provider. Config saved to ~/.cloe/tts-config.json')}</div>
          </div>
          <div class="pref-control">
            <select id="tts-provider" class="form-input form-select" style="width:280px;">
              <option value="openai">${PROVIDER_LABELS.openai[isZh ? 'zh' : 'en']}</option>
              <option value="mosi">${PROVIDER_LABELS.mosi[isZh ? 'zh' : 'en']}</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="pref-section">
      <h2 class="pref-section-title" id="tts-fields-title">${t('Provider Configuration', 'Provider Configuration')}</h2>
      <div class="pref-group" id="tts-fields-container">
      </div>
    </div>

    <div class="pref-section">
      <h2 class="pref-section-title">${t('Test', 'Test')}</h2>
      <div class="pref-group">
        <div class="pref-item">
          <div class="pref-info">
            <div class="pref-label">${t('Test Voice', 'Test Voice')}</div>
            <div class="pref-desc">${t('Generate a test speech and play it on the desktop', 'Generate a test speech and play it on the desktop')}</div>
          </div>
          <div class="pref-control">
            <input type="text" id="tts-test-text" class="form-input" style="width:300px;" placeholder="${t('Hello, I am Cloe', 'Hello, I am Cloe')}" value="${t('Hello, TTS is working!', 'Hello, TTS is working!')}">
            <button type="button" class="btn btn-primary btn-sm" id="tts-test-btn" style="margin-left:8px;">${t('Test', 'Test')}</button>
            <span id="tts-test-result" style="font-size:12px;margin-left:8px;"></span>
          </div>
        </div>
      </div>
    </div>
  `;

  const providerSelect = document.getElementById('tts-provider');
  const fieldsContainer = document.getElementById('tts-fields-container');
  const testBtn = document.getElementById('tts-test-btn');
  const testResult = document.getElementById('tts-test-result');
  const testTextInput = document.getElementById('tts-test-text');

  let currentConfig = {};

  function renderProviderFields(provider) {
    const fields = PROVIDER_FIELDS[provider] || [];
    fieldsContainer.innerHTML = fields.map(f => `
      <div class="pref-item">
        <div class="pref-info">
          <div class="pref-label">${f.label[isZh ? 'zh' : 'en']}</div>
        </div>
        <div class="pref-control">
          <div class="pref-api-key-wrap">
            <input type="${f.type}" id="tts-field-${f.key}" class="form-input" style="width:320px;"
              placeholder="${f.placeholder || ''}"
              value="${escapeAttr(currentConfig[provider]?.[f.key] || '')}"
              autocomplete="off" spellcheck="false">
            ${f.type === 'password' ? `<button type="button" class="btn-icon btn-icon-sm" id="tts-toggle-${f.key}" title="${t('Show/Hide', 'Show/Hide')}">👁</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');

    // Bind password toggles
    fields.filter(f => f.type === 'password').forEach(f => {
      const toggle = document.getElementById(`tts-toggle-${f.key}`);
      const input = document.getElementById(`tts-field-${f.key}`);
      if (toggle && input) {
        toggle.addEventListener('click', () => {
          input.type = input.type === 'password' ? 'text' : 'password';
        });
      }
    });

    // Bind change to save
    fields.forEach(f => {
      const input = document.getElementById(`tts-field-${f.key}`);
      if (input) {
        input.addEventListener('change', saveConfig);
      }
    });
  }

  function gatherConfig() {
    const provider = providerSelect.value;
    const fields = PROVIDER_FIELDS[provider] || [];
    const providerCfg = {};
    fields.forEach(f => {
      const input = document.getElementById(`tts-field-${f.key}`);
      if (input && input.value.trim()) {
        providerCfg[f.key] = input.value.trim();
      }
    });
    return { provider, [provider]: providerCfg };
  }

  async function saveConfig() {
    const cfg = gatherConfig();
    // Merge with existing to preserve other providers' config
    const merged = { ...currentConfig, ...cfg };
    try {
      await fetch(`${API_TTS_BASE}/tts/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
    } catch {}
  }

  async function loadConfig() {
    try {
      const res = await fetch(`${API_TTS_BASE}/tts/config`);
      if (!res.ok) return;
      currentConfig = await res.json();
      const provider = currentConfig.provider || 'openai';
      providerSelect.value = provider;
      renderProviderFields(provider);
    } catch {
      renderProviderFields('openai');
    }
  }

  providerSelect.addEventListener('change', () => {
    renderProviderFields(providerSelect.value);
    saveConfig();
  });

  testBtn.addEventListener('click', async () => {
    saveConfig();
    testBtn.disabled = true;
    testResult.textContent = t('Generating…', 'Generating…');
    testResult.style.color = '';
    try {
      const text = testTextInput.value.trim() || t('Hello', 'Hello');
      const res = await fetch(`${API_TTS_BASE}/tts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speak: true }),
      });
      const data = await res.json();
      if (data.ok) {
        testResult.textContent = t('✅ Played successfully', '✅ Played successfully');
        testResult.style.color = 'var(--accent, #4fc3f7)';
      } else {
        testResult.textContent = '❌ ' + (data.error || t('Unknown error', 'Unknown error'));
        testResult.style.color = 'var(--danger, #e57373)';
      }
    } catch (e) {
      testResult.textContent = '❌ ' + e.message;
      testResult.style.color = 'var(--danger, #e57373)';
    }
    testBtn.disabled = false;
  });

  loadConfig();
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Expose for manager.js tab switching
window.initTtsTab = initTtsTab;
