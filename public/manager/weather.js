// ==================== Cloe Settings — Weather Tab ====================

const API_WEATHER_BASE = 'http://127.0.0.1:19851';

function initWeatherTab() {
  renderWeather();
}

function renderWeather() {
  const container = document.getElementById('weather-content');
  if (!container) return;

  const isZh = (typeof I18n !== 'undefined' && I18n.getLocale()?.startsWith('zh')) || document.documentElement.lang?.startsWith('zh');
  const t = (zh, en) => (isZh ? zh : en);

  container.innerHTML = `
    <div class="pref-section">
      <h2 class="pref-section-title">${t('Weather Effects', 'Weather Effects')}</h2>
      <div class="pref-group">
        <div class="pref-item">
          <div class="pref-info">
            <div class="pref-label">${t('Enable Weather Effects', 'Enable Weather Effects')}</div>
            <div class="pref-desc">${t('Show dynamic particle effects based on current weather, independent of window opacity', 'Show dynamic particle effects based on current weather, independent of window opacity')}</div>
          </div>
          <div class="pref-control">
            <label class="toggle">
              <input type="checkbox" id="weather-enabled">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="pref-item">
          <div class="pref-info">
            <div class="pref-label">${t('Provider', 'Provider')}</div>
            <div class="pref-desc">${t('Choose weather data provider', 'Choose weather data provider')}</div>
          </div>
          <div class="pref-control">
            <select id="weather-provider" class="form-input form-select" style="width:220px;">
              <option value="open-meteo">Open-Meteo (${t('Free, no key', 'Free, no key')})</option>
              <option value="qweather">${t('QWeather', 'QWeather')} (${t('requires key', 'requires key')})</option>
            </select>
          </div>
        </div>

        <div class="pref-item" id="weather-apikey-row" style="display:none;">
          <div class="pref-info">
            <div class="pref-label">${t('API Key', 'API Key')}</div>
            <div class="pref-desc">${t('QWeather API Key', 'QWeather API Key')}</div>
          </div>
          <div class="pref-control">
            <div class="pref-api-key-wrap">
              <input type="password" id="weather-apikey" class="form-input" placeholder="${t('Enter API Key', 'Enter API Key')}" autocomplete="off" spellcheck="false">
              <button type="button" class="btn-icon btn-icon-sm" id="weather-apikey-toggle" title="${t('Show/Hide', 'Show/Hide')}">👁</button>
            </div>
          </div>
        </div>

        <div class="pref-item">
          <div class="pref-info">
            <div class="pref-label">${t('City', 'City')}</div>
            <div class="pref-desc">${t('Leave empty or "auto" for auto-detect, or specify a city name', 'Leave empty or "auto" for auto-detect, or specify a city name')}</div>
          </div>
          <div class="pref-control">
            <input type="text" id="weather-city" class="form-input" style="width:220px;" placeholder="${t('auto / Chengdu', 'auto / Chengdu')}">
          </div>
        </div>

        <div class="pref-item">
          <div class="pref-info">
            <div class="pref-label">${t('Refresh Interval', 'Refresh Interval')}</div>
            <div class="pref-desc">${t('How often to refresh weather data', 'How often to refresh weather data')}</div>
          </div>
          <div class="pref-control">
            <select id="weather-interval" class="form-input form-select" style="width:120px;">
              <option value="5">5 ${t('min', 'min')}</option>
              <option value="15">15 ${t('min', 'min')}</option>
              <option value="30" selected>30 ${t('min', 'min')}</option>
              <option value="60">60 ${t('min', 'min')}</option>
            </select>
          </div>
        </div>

        <div class="pref-item">
          <div class="pref-info">
            <div class="pref-label">${t('Test Connection', 'Test Connection')}</div>
            <div class="pref-desc">${t('Fetch weather now and apply effects', 'Fetch weather now and apply effects')}</div>
          </div>
          <div class="pref-control">
            <button type="button" class="btn btn-primary btn-sm" id="weather-test-btn">${t('Test', 'Test')}</button>
            <span id="weather-test-result" style="font-size:12px;margin-left:8px;"></span>
          </div>
        </div>

      </div>
    </div>

    <div class="pref-section">
      <h2 class="pref-section-title">${t('Effect Preview', 'Effect Preview')}</h2>
      <div class="pref-group">
        <div class="pref-item" style="flex-direction:column;align-items:stretch;">
          <div class="pref-info" style="margin-bottom:10px;">
            <div class="pref-label">${t('Click to preview weather effects', 'Click to preview weather effects')}</div>
            <div class="pref-desc">${t('Choose day or night, click a weather type to preview. Click "End Preview" to restore real weather', 'Choose day or night, click a weather type to preview. Click "End Preview" to restore real weather')}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;">
              <input type="radio" name="preview-time" value="day" checked> ${t('☀️ Day', '☀️ Day')}
            </label>
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:13px;">
              <input type="radio" name="preview-time" value="night"> ${t('🌙 Night', '🌙 Night')}
            </label>
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;">
            <span style="font-size:13px;white-space:nowrap;">🕐 ${t('Time', 'Time')}</span>
            <input type="range" id="preview-hour-slider" min="0" max="23" step="1" value="12" style="flex:1;cursor:pointer;">
            <span id="preview-hour-label" style="font-size:14px;font-weight:600;min-width:50px;text-align:center;">12:00</span>
            <span id="preview-hour-dn" style="font-size:13px;min-width:28px;">☀️</span>
          </div>
          <div id="weather-preview-grid" style="display:flex;flex-wrap:wrap;gap:8px;padding-left:0;margin-bottom:12px;">
            ${[
              ['clear', '☀️ ' + t('Clear', 'Clear')],
              ['cloudy', '☁️ ' + t('Cloudy', 'Cloudy')],
              ['rain', '🌧️ ' + t('Rain', 'Rain')],
              ['snow', '❄️ ' + t('Snow', 'Snow')],
              ['fog', '🌫️ ' + t('Fog', 'Fog')],
              ['thunderstorm', '⛈️ ' + t('Thunderstorm', 'Thunderstorm')],
              ['icy', '🧊 ' + t('Icy', 'Icy')],
            ].map(([wt, label]) => `<button type="button" class="btn btn-secondary btn-sm weather-preview-btn" data-wt="${wt}">${label}</button>`).join('')}
          </div>
        </div>

        <div class="pref-item" style="flex-direction:column;align-items:stretch;">
          <div class="pref-info" style="margin-bottom:10px;">
            <div class="pref-label">${t('Special Phenomena', 'Special Phenomena')}</div>
            <div class="pref-desc">${t('Rare weather phenomena, overlaid on current preview weather', 'Rare weather phenomena, overlaid on current preview weather')}</div>
          </div>
          <div id="weather-special-grid" style="display:flex;flex-wrap:wrap;gap:8px;padding-left:0;margin-bottom:12px;">
            ${[
              ['meteor', '🌠 ' + t('Meteor Shower', 'Meteor Shower')],
              ['fireball', '🔥 ' + t('Fireball', 'Fireball')],
              ['aurora', '🌌 ' + t('Aurora', 'Aurora')],
              ['rainbow', '🌈 ' + t('Rainbow', 'Rainbow')],
              ['sundog', '☀️ ' + t('Sundog', 'Sundog')],
            ].map(([st, label]) => `<button type="button" class="btn btn-secondary btn-sm weather-special-btn" data-st="${st}">${label}</button>`).join('')}
          </div>
        </div>

        <div class="pref-item">
          <div class="pref-info">
            <div class="pref-label">${t('End Preview', 'End Preview')}</div>
            <div class="pref-desc">${t('Restore current real weather', 'Restore current real weather')}</div>
          </div>
          <div class="pref-control">
            <button type="button" class="btn btn-primary btn-sm" id="weather-preview-end-btn">${t('End Preview', 'End Preview')}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // --- Load current config ---
  const enabledToggle = document.getElementById('weather-enabled');
  const providerSelect = document.getElementById('weather-provider');
  const apikeyRow = document.getElementById('weather-apikey-row');
  const apikeyInput = document.getElementById('weather-apikey');
  const apikeyToggle = document.getElementById('weather-apikey-toggle');
  const cityInput = document.getElementById('weather-city');
  const intervalSelect = document.getElementById('weather-interval');
  const testBtn = document.getElementById('weather-test-btn');
  const testResult = document.getElementById('weather-test-result');

  function updateApikeyVisibility() {
    apikeyRow.style.display = providerSelect.value === 'qweather' ? 'flex' : 'none';
  }

  async function loadConfig() {
    try {
      const res = await fetch(`${API_WEATHER_BASE}/weather/config`);
      const cfg = await res.json();
      enabledToggle.checked = cfg.enabled || false;
      providerSelect.value = cfg.provider || 'open-meteo';
      apikeyInput.value = cfg.apiKey || '';
      cityInput.value = cfg.city === 'auto' ? '' : (cfg.city || '');
      intervalSelect.value = String(cfg.intervalMin || 30);
      updateApikeyVisibility();
    } catch (e) {
      // bridge offline
    }
  }

  function saveConfig() {
    const payload = {
      enabled: enabledToggle.checked,
      provider: providerSelect.value,
      apiKey: apikeyInput.value.trim(),
      city: cityInput.value.trim() || 'auto',
      intervalMin: parseInt(intervalSelect.value),
    };
    fetch(`${API_WEATHER_BASE}/weather/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  // --- Bind events ---
  enabledToggle.addEventListener('change', saveConfig);
  providerSelect.addEventListener('change', () => { updateApikeyVisibility(); saveConfig(); });
  cityInput.addEventListener('change', saveConfig);
  intervalSelect.addEventListener('change', saveConfig);

  apikeyToggle.addEventListener('click', () => {
    apikeyInput.type = apikeyInput.type === 'password' ? 'text' : 'password';
  });
  apikeyInput.addEventListener('change', saveConfig);

  testBtn.addEventListener('click', async () => {
    saveConfig();
    testBtn.disabled = true;
    testResult.textContent = t('Testing…', 'Testing…');
    testResult.style.color = '';
    try {
      const res = await fetch(`${API_WEATHER_BASE}/weather/test`, { method: 'POST' });
      const data = await res.json();
      if (data.weather) {
        const w = data.weather;
        testResult.textContent = `${w.city}: ${w.text} ${w.temp}°C`;
        testResult.style.color = 'var(--accent)';
      } else {
        testResult.textContent = t('No weather data', 'No weather data');
        testResult.style.color = 'var(--danger, #e57373)';
      }
    } catch (e) {
      testResult.textContent = t('Failed', 'Failed');
      testResult.style.color = 'var(--danger, #e57373)';
    }
    testBtn.disabled = false;
  });

  // --- Preview buttons ---
  const hourSlider = document.getElementById('preview-hour-slider');
  const hourLabel = document.getElementById('preview-hour-label');
  const hourDn = document.getElementById('preview-hour-dn');

  function getPreviewHour() {
    return parseInt(hourSlider.value, 10);
  }

  function updateHourDisplay() {
    const h = getPreviewHour();
    hourLabel.textContent = `${String(h).padStart(2, '0')}:00`;
    const isNight = h < 6 || h >= 19;
    hourDn.textContent = isNight ? '🌙' : '☀️';
    // Sync radio buttons
    const radio = document.querySelector(`input[name="preview-time"][value="${isNight ? 'night' : 'day'}"]`);
    if (radio) radio.checked = true;
  }

  function getPreviewIsNight() {
    const h = getPreviewHour();
    return h < 6 || h >= 19;
  }

  // Update display when slider changes, and re-preview if currently previewing
  hourSlider.addEventListener('input', () => {
    updateHourDisplay();
    // If a weather preview button is currently "active" (highlighted), re-trigger it
    const activeBtn = document.querySelector('.weather-preview-btn.active-preview');
    if (activeBtn) activeBtn.click();
  });
  updateHourDisplay();

  // Radio buttons also sync the slider
  document.querySelectorAll('input[name="preview-time"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isNight = radio.value === 'night';
      // Jump slider to a representative hour
      hourSlider.value = isNight ? '21' : '12';
      updateHourDisplay();
      const activeBtn = document.querySelector('.weather-preview-btn.active-preview');
      if (activeBtn) activeBtn.click();
    });
  });

  document.querySelectorAll('.weather-preview-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const wt = btn.dataset.wt;
      const isNight = getPreviewIsNight();
      const previewHour = getPreviewHour();
      // Mark active
      document.querySelectorAll('.weather-preview-btn').forEach(b => b.classList.remove('active-preview'));
      btn.classList.add('active-preview');
      fetch(`${API_WEATHER_BASE}/weather/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weatherType: wt, isNight, previewHour }),
      }).catch(() => {});
    });
  });

  // --- Special phenomena preview ---
  // Special phenomena need matching conditions, so we pick the right weather backdrop
  const SPECIAL_BACKDROP = {
    meteor: 'clear',
    fireball: 'clear',
    aurora: 'clear',
    rainbow: 'rain',
    sundog: 'clear',
  };
  document.querySelectorAll('.weather-special-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const st = btn.dataset.st;
      const isNight = getPreviewIsNight();
      const previewHour = getPreviewHour();
      // Some specials only make sense at night, override isNight for those
      const forceNight = st === 'meteor' || st === 'fireball' || st === 'aurora';
      const actualNight = forceNight ? true : isNight;
      const actualHour = forceNight ? 23 : previewHour;
      const backdrop = SPECIAL_BACKDROP[st] || 'clear';
      fetch(`${API_WEATHER_BASE}/weather/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weatherType: backdrop, specialType: st, isNight: actualNight, previewHour: actualHour }),
      }).catch(() => {});
    });
  });

  // --- End preview button ---
  document.getElementById('weather-preview-end-btn').addEventListener('click', () => {
    document.querySelectorAll('.weather-preview-btn').forEach(b => b.classList.remove('active-preview'));
    fetch(`${API_WEATHER_BASE}/weather/preview-end`, { method: 'POST' }).catch(() => {});
  });

  loadConfig();
}

// Expose for manager.js tab switching
window.initWeatherTab = initWeatherTab;
