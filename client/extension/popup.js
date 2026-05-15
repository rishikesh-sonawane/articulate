/**
 * Popup settings handler for Articulate Extension
 */

const DEFAULT_SETTINGS = {
  mode: 'polished',
  backendUrl: 'http://localhost:8080',
  theme: 'dark',
  autoPolish: true,
  showConfirmation: true,
  transcriptionProvider: 'browser',
  reconnectAttempts: 3,
  reconnectDelay: 1000,
};

// DOM Elements
const elements = {
  mode: null,
  backendUrl: null,
  theme: null,
  autoPolish: null,
  showConfirmation: null,
  saveBtn: null,
  resetBtn: null,
  status: null,
  backendStatus: null,
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  initializeElements();
  await loadSettings();
  await checkBackendStatus();
  setupEventListeners();
});

/**
 * Cache DOM element references
 */
function initializeElements() {
  elements.mode = document.getElementById('mode');
  elements.backendUrl = document.getElementById('backendUrl');
  elements.theme = document.getElementById('theme');
  elements.autoPolish = document.getElementById('autoPolish');
  elements.showConfirmation = document.getElementById('showConfirmation');
  elements.saveBtn = document.getElementById('saveBtn');
  elements.resetBtn = document.getElementById('resetBtn');
  elements.status = document.getElementById('status');
  elements.backendStatus = document.getElementById('backend-status');
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  if (elements.saveBtn) {
    elements.saveBtn.addEventListener('click', saveSettings);
  }

  if (elements.resetBtn) {
    elements.resetBtn.addEventListener('click', resetSettings);
  }

  // Validate backend URL on change
  if (elements.backendUrl) {
    elements.backendUrl.addEventListener('blur', validateBackendUrl);
    elements.backendUrl.addEventListener('input', clearStatus);
  }
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });

    if (response.success && response.settings) {
      const settings = response.settings;

      // Populate form fields
      if (elements.mode) {
        elements.mode.value = settings.mode || DEFAULT_SETTINGS.mode;
      }

      if (elements.backendUrl) {
        elements.backendUrl.value = settings.backendUrl || DEFAULT_SETTINGS.backendUrl;
      }

      if (elements.theme) {
        elements.theme.value = settings.theme || DEFAULT_SETTINGS.theme;
      }

      if (elements.autoPolish) {
        elements.autoPolish.checked = settings.autoPolish !== undefined
          ? settings.autoPolish
          : DEFAULT_SETTINGS.autoPolish;
      }

      if (elements.showConfirmation) {
        elements.showConfirmation.checked = settings.showConfirmation !== undefined
          ? settings.showConfirmation
          : DEFAULT_SETTINGS.showConfirmation;
      }

      console.log('[Popup] Settings loaded:', settings);
    }
  } catch (error) {
    console.error('[Popup] Failed to load settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}

/**
 * Check backend connection status
 */
async function checkBackendStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_BACKEND_STATUS' });

    if (response.success && response.status) {
      updateBackendStatus(response.status);
    }
  } catch (error) {
    console.error('[Popup] Failed to check backend status:', error);
    updateBackendStatus({ connected: false, error: 'Failed to check' });
  }
}

/**
 * Update backend status display
 */
function updateBackendStatus(status) {
  const statusEl = elements.backendStatus;
  if (!statusEl) return;

  if (status.connected) {
    statusEl.innerHTML = '<span class="status-indicator connected"></span> Backend connected';
    statusEl.className = 'backend-status connected';
  } else {
    statusEl.innerHTML = `<span class="status-indicator disconnected"></span> Disconnected (${status.error || 'unknown'})`;
    statusEl.className = 'backend-status disconnected';
  }
}

/**
 * Validate backend URL format
 */
function validateBackendUrl() {
  const url = elements.backendUrl?.value?.trim();

  if (!url) {
    showStatus('Backend URL is required', 'error');
    return false;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    showStatus('URL must start with http:// or https://', 'error');
    return false;
  }

  try {
    new URL(url);
    return true;
  } catch {
    showStatus('Invalid URL format', 'error');
    return false;
  }
}

/**
 * Clear status message
 */
function clearStatus() {
  if (elements.status) {
    elements.status.className = 'status';
    elements.status.textContent = '';
  }
}

/**
 * Save settings
 */
async function saveSettings() {
  clearStatus();

  // Validate URL first
  if (!validateBackendUrl()) {
    return;
  }

  const settings = {
    mode: elements.mode?.value || DEFAULT_SETTINGS.mode,
    backendUrl: elements.backendUrl?.value?.trim() || DEFAULT_SETTINGS.backendUrl,
    theme: elements.theme?.value || DEFAULT_SETTINGS.theme,
    autoPolish: elements.autoPolish?.checked ?? DEFAULT_SETTINGS.autoPolish,
    showConfirmation: elements.showConfirmation?.checked ?? DEFAULT_SETTINGS.showConfirmation,
  };

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings,
    });

    if (response.success) {
      showStatus('Settings saved!', 'success');

      // Check backend status after saving
      setTimeout(async () => {
        await checkBackendStatus();
      }, 1000);

      // Close popup after delay
      setTimeout(() => {
        window.close();
      }, 1500);
    } else {
      showStatus('Failed to save settings', 'error');
    }
  } catch (error) {
    console.error('[Popup] Save error:', error);
    showStatus('Failed to save settings', 'error');
  }
}

/**
 * Reset settings to defaults
 */
function resetSettings() {
  if (confirm('Reset all settings to default values?')) {
    // Reset form values
    if (elements.mode) {
      elements.mode.value = DEFAULT_SETTINGS.mode;
    }

    if (elements.backendUrl) {
      elements.backendUrl.value = DEFAULT_SETTINGS.backendUrl;
    }

    if (elements.theme) {
      elements.theme.value = DEFAULT_SETTINGS.theme;
    }

    if (elements.autoPolish) {
      elements.autoPolish.checked = DEFAULT_SETTINGS.autoPolish;
    }

    if (elements.showConfirmation) {
      elements.showConfirmation.checked = DEFAULT_SETTINGS.showConfirmation;
    }

    showStatus('Settings reset to defaults', 'success');
  }
}

/**
 * Show status message
 */
function showStatus(message, type) {
  if (!elements.status) return;

  elements.status.textContent = message;
  elements.status.className = `status show ${type}`;

  // Auto-hide after 3 seconds
  setTimeout(() => {
    elements.status.classList.remove('show');
  }, 3000);
}

console.log('[Popup] Script loaded');