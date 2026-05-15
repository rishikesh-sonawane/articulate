/**
 * Background Service Worker for Articulate Extension
 * Handles global state, messaging, and extension lifecycle
 */

// Global state
const state = {
  isListening: false,
  currentSession: null,
  settings: {
    mode: 'polished',
    backendUrl: 'http://localhost:8080',
    theme: 'dark',
    autoPolish: true,
    showConfirmation: true,
    transcriptionProvider: 'browser',
    reconnectAttempts: 3,
    reconnectDelay: 1000,
  },
};

// Initialize extension
function initialize() {
  console.log('[Background] Initializing service worker');

  // Set up install/update handlers
  chrome.runtime.onInstalled.addListener(handleInstall);
  chrome.runtime.onUpdateAvailable.addListener(handleUpdate);

  // Set up message handlers
  chrome.runtime.onMessage.addListener(handleMessage);

  // Set up tab handlers
  chrome.tabs.onActivated.addListener(handleTabChange);
  chrome.tabs.onUpdated.addListener(handleTabUpdate);

  console.log('[Background] Service worker initialized');
}

/**
 * Handle extension installation
 */
async function handleInstall(details) {
  console.log('[Background] Extension installed/updated:', details.reason);

  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // First time install - show welcome
    await initializeDefaultSettings();
    console.log('[Background] First install - settings initialized');
  } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
    // Update - migrate settings if needed
    await migrateSettings();
    console.log('[Background] Update - settings migrated');
  }
}

/**
 * Handle extension update available
 */
function handleUpdate() {
  console.log('[Background] Update available');
}

/**
 * Initialize default settings
 */
async function initializeDefaultSettings() {
  const defaultSettings = {
    mode: 'polished',
    backendUrl: 'http://localhost:8080',
    theme: 'dark',
    autoPolish: true,
    showConfirmation: true,
    transcriptionProvider: 'browser',
    reconnectAttempts: 3,
    reconnectDelay: 1000,
  };

  try {
    await chrome.storage.local.set({ articulate_settings: defaultSettings });
    state.settings = defaultSettings;
    console.log('[Background] Default settings saved');
  } catch (error) {
    console.error('[Background] Failed to save default settings:', error);
  }
}

/**
 * Migrate settings from older versions
 */
async function migrateSettings() {
  try {
    const data = await chrome.storage.local.get('articulate_settings');

    if (!data.articulate_settings) {
      await initializeDefaultSettings();
      return;
    }

    // Add any missing keys with defaults
    const current = data.articulate_settings;
    const defaults = {
      transcriptionProvider: 'backend',
      reconnectAttempts: 3,
      reconnectDelay: 1000,
    };

    const updated = { ...defaults, ...current };
    await chrome.storage.local.set({ articulate_settings: updated });
    state.settings = updated;
  } catch (error) {
    console.error('[Background] Settings migration failed:', error);
  }
}

/**
 * Handle incoming messages from content scripts and popup
 */
function handleMessage(request, sender, sendResponse) {
  console.log('[Background] Message received:', request.type, 'from', sender.id);

  switch (request.type) {
    case 'GET_SETTINGS':
      getSettings().then((settings) => {
        sendResponse({ success: true, settings });
      });
      return true; // Keep message channel open for async response

    case 'UPDATE_SETTINGS':
      updateSettings(request.settings).then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'LOG_EVENT':
      logEvent(request.event, request.data);
      sendResponse({ success: true });
      break;

    case 'GET_BACKEND_STATUS':
      checkBackendStatus().then((status) => {
        sendResponse({ success: true, status });
      });
      return true;

    default:
      console.log('[Background] Unknown message type:', request.type);
      sendResponse({ success: false, error: 'Unknown request type' });
  }
}

/**
 * Get current settings
 */
async function getSettings() {
  try {
    const data = await chrome.storage.local.get('articulate_settings');
    const settings = data.articulate_settings || state.settings;
    state.settings = settings;
    return settings;
  } catch (error) {
    console.error('[Background] Failed to get settings:', error);
    return state.settings;
  }
}

/**
 * Update settings
 */
async function updateSettings(newSettings) {
  try {
    const current = await getSettings();
    const updated = { ...current, ...newSettings };

    await chrome.storage.local.set({ articulate_settings: updated });
    state.settings = updated;

    // Notify all tabs about settings change
    notifySettingsChange(updated);

    console.log('[Background] Settings updated:', updated);
    return true;
  } catch (error) {
    console.error('[Background] Failed to update settings:', error);
    throw error;
  }
}

/**
 * Notify all tabs about settings change
 */
async function notifySettingsChange(settings) {
  try {
    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'SETTINGS_UPDATED',
          settings,
        }).catch(() => {
          // Ignore errors for tabs without content script
        });
      } catch {
        // Ignore errors
      }
    }
  } catch (error) {
    console.error('[Background] Failed to notify tabs:', error);
  }
}

/**
 * Log analytics event
 */
function logEvent(event, data) {
  // Store locally for now - could be sent to analytics service later
  const eventData = {
    event,
    data,
    timestamp: new Date().toISOString(),
    version: chrome.runtime.getManifest().version,
  };

  console.log('[Analytics]', eventData);

  // Could store in chrome.storage.local for batch processing
  chrome.storage.local.get(['articulate_events'], (result) => {
    const events = result.articulate_events || [];
    events.push(eventData);

    // Keep only last 100 events
    if (events.length > 100) {
      events.splice(0, events.length - 100);
    }

    chrome.storage.local.set({ articulate_events: events });
  });
}

/**
 * Check backend status
 */
async function checkBackendStatus() {
  const settings = await getSettings();
  const healthUrl = 'http://localhost:8080/health';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return { connected: true, ...data };
    }

    return { connected: false, error: `HTTP ${response.status}` };
  } catch (error) {
    return {
      connected: false,
      error: error.name === 'AbortError' ? 'Timeout' : error.message,
    };
  }
}

/**
 * Handle tab activation change
 */
function handleTabChange(activeInfo) {
  console.log('[Background] Tab activated:', activeInfo.tabId);
}

/**
 * Handle tab update
 */
function handleTabUpdate(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url) {
    console.log('[Background] Tab loaded:', tab.url);
  }
}

// Start the service worker
initialize();

console.log('[Background] Service worker loaded');