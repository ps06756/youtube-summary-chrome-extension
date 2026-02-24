document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('popup-status');
  const DOTS = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

  const providerSelect = document.getElementById('provider-select');
  const stepModel = document.getElementById('step-model');
  const modelSelect = document.getElementById('model-select');
  const customModelInput = document.getElementById('custom-model-input');
  const stepCredentials = document.getElementById('step-credentials');
  const baseUrlGroup = document.getElementById('base-url-group');
  const baseUrlInput = document.getElementById('base-url-input');
  const apiKeyInput = document.getElementById('api-key-input');

  const ANTHROPIC_MODELS = [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ];

  const OPENAI_MODELS = [
    { value: 'kimi-k2-0905-preview', label: 'Kimi K2.5 (kimi-k2-0905-preview)' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: '__custom__', label: 'Custom...' },
  ];

  // Old storage keys to clean up on save
  const OLD_KEYS = ['anthropicApiKey', 'openaiApiKey', 'openaiBaseUrl', 'openaiModel'];

  function populateModels(provider) {
    const models = provider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS;
    modelSelect.innerHTML = '';
    models.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.label;
      modelSelect.appendChild(opt);
    });
    customModelInput.style.display = 'none';
    customModelInput.value = '';
  }

  function showStep2() {
    stepModel.style.display = 'block';
  }

  function hideStep2() {
    stepModel.style.display = 'none';
  }

  function showStep3() {
    stepCredentials.style.display = 'block';
    const provider = providerSelect.value;
    baseUrlGroup.style.display = provider === 'openai' ? 'block' : 'none';
  }

  function hideStep3() {
    stepCredentials.style.display = 'none';
  }

  // Provider change → show step 2, hide step 3
  providerSelect.addEventListener('change', () => {
    const provider = providerSelect.value;
    if (!provider) return;
    populateModels(provider);
    showStep2();
    hideStep3();
    // Auto-show step 3 since a default model is already selected
    showStep3();
  });

  // Model change → show step 3, handle custom
  modelSelect.addEventListener('change', () => {
    const isCustom = modelSelect.value === '__custom__';
    customModelInput.style.display = isCustom ? 'block' : 'none';
    if (isCustom) customModelInput.focus();
    showStep3();
  });

  // Load saved config (with migration from old storage keys)
  chrome.storage.local.get(
    ['provider', 'model', 'apiKey', 'baseUrl', ...OLD_KEYS],
    (result) => {
      // Migrate old keys → new keys if needed
      if (!result.apiKey && (result.anthropicApiKey || result.openaiApiKey)) {
        const migrated = { provider: result.provider || 'anthropic' };
        if (result.provider === 'openai') {
          migrated.apiKey = result.openaiApiKey;
          migrated.baseUrl = result.openaiBaseUrl;
          migrated.model = result.openaiModel || 'kimi-k2-0905-preview';
        } else {
          migrated.apiKey = result.anthropicApiKey;
          migrated.model = 'claude-sonnet-4-20250514';
        }
        // Write migrated keys and remove old ones
        chrome.storage.local.set(migrated, () => {
          chrome.storage.local.remove(OLD_KEYS, () => {
            // Reload with migrated data
            Object.assign(result, migrated);
            applyLoadedConfig(result);
            status.textContent = 'Settings migrated & loaded.';
          });
        });
        return;
      }

      applyLoadedConfig(result);
    }
  );

  function applyLoadedConfig(result) {
    if (result.provider) {
      providerSelect.value = result.provider;
      populateModels(result.provider);
      showStep2();

      if (result.model) {
        // Check if model is in the preset list
        const options = Array.from(modelSelect.options).map((o) => o.value);
        if (options.includes(result.model)) {
          modelSelect.value = result.model;
        } else {
          // It's a custom model — select "Custom..." and fill the input
          if (result.provider === 'openai') {
            modelSelect.value = '__custom__';
            customModelInput.value = result.model;
            customModelInput.style.display = 'block';
          } else {
            modelSelect.value = options[0];
          }
        }
      }

      showStep3();

      if (result.baseUrl) {
        baseUrlInput.value = result.baseUrl;
      }
      if (result.apiKey) {
        apiKeyInput.value = DOTS;
      }

      status.textContent = 'Settings loaded.';
    }
  }

  // Save
  document.getElementById('popup-save-btn').addEventListener('click', () => {
    const provider = providerSelect.value;
    if (!provider) {
      status.textContent = 'Please select a provider.';
      return;
    }

    let model = modelSelect.value;
    if (model === '__custom__') {
      model = customModelInput.value.trim();
      if (!model) {
        status.textContent = 'Please enter a custom model name.';
        return;
      }
    }

    const apiKey = apiKeyInput.value.trim();
    const toSave = { provider, model };

    if (apiKey && apiKey !== DOTS) {
      toSave.apiKey = apiKey;
    }

    if (provider === 'openai') {
      const baseUrl = baseUrlInput.value.trim();
      if (baseUrl) toSave.baseUrl = baseUrl;
    }

    // Clean up old keys then save new ones
    chrome.storage.local.remove(OLD_KEYS, () => {
      chrome.storage.local.set(toSave, () => {
        if (toSave.apiKey) {
          apiKeyInput.value = DOTS;
        }
        status.textContent = 'Saved!';
      });
    });
  });

  // Clear
  document.getElementById('popup-clear-btn').addEventListener('click', () => {
    chrome.storage.local.remove([...OLD_KEYS, 'provider', 'model', 'apiKey', 'baseUrl'], () => {
      providerSelect.value = '';
      modelSelect.innerHTML = '';
      customModelInput.value = '';
      customModelInput.style.display = 'none';
      apiKeyInput.value = '';
      baseUrlInput.value = '';
      hideStep2();
      hideStep3();
      status.textContent = 'Cleared.';
    });
  });
});
