/**
 * Popup settings handler
 */

const defaultSettings = {
  mode: 'polished',
  backendUrl: 'ws://localhost:8080',
  theme: 'dark',
  autoPolish: true,
  showConfirmation: true,
};

// Load settings on popup open
document.addEventListener('DOMContentLoaded', loadSettings);

// Event listeners
document.getElementById('saveBtn').addEventListener('click', saveSettings);
document.getElementById('resetBtn').addEventListener('click', resetSettings);

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });

  if (response.success && response.settings) {
    const settings = response.settings;

    document.getElementById('mode').value = settings.mode || defaultSettings.mode;
    document.getElementById('backendUrl').value = settings.backendUrl || defaultSettings.backendUrl;
    document.getElementById('theme').value = settings.theme || defaultSettings.theme;
    document.getElementById('autoPolish').checked =
      settings.autoPolish !== undefined ? settings.autoPolish : defaultSettings.autoPolish;
    document.getElementById('showConfirmation').checked =
      settings.showConfirmation !== undefined
        ? settings.showConfirmation
        : defaultSettings.showConfirmation;
  }
}

async function saveSettings() {
  const settings = {
    mode: document.getElementById('mode').value,
    backendUrl: document.getElementById('backendUrl').value,
    theme: document.getElementById('theme').value,
    autoPolish: document.getElementById('autoPolish').checked,
    showConfirmation: document.getElementById('showConfirmation').checked,
  };

  // Validate URL
  if (!settings.backendUrl.startsWith('ws://') && !settings.backendUrl.startsWith('wss://')) {
    showStatus('Invalid URL. Must start with ws:// or wss://', 'error');
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: settings,
  });

  if (response.success) {
    showStatus('Settings saved successfully!', 'success');
    setTimeout(() => window.close(), 1500);
  } else {
    showStatus('Failed to save settings', 'error');
  }
}

function resetSettings() {
  if (confirm('Reset to default settings?')) {
    document.getElementById('mode').value = defaultSettings.mode;
    document.getElementById('backendUrl').value = defaultSettings.backendUrl;
    document.getElementById('theme').value = defaultSettings.theme;
    document.getElementById('autoPolish').checked = defaultSettings.autoPolish;
    document.getElementById('showConfirmation').checked = defaultSettings.showConfirmation;
    showStatus('Settings reset to defaults', 'success');
  }
}

function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status show ${type}`;

  setTimeout(() => {
    statusEl.classList.remove('show');
  }, 3000);
}
