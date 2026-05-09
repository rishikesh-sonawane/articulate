/**
 * Background Service Worker for Articulate Extension
 * Handles global state, messaging, and extension lifecycle
 */

// Global state
const state = {
  isListening: false,
  currentSession: null,
  settings: {
    mode: 'polished', // 'raw' or 'polished'
    backendUrl: 'ws://localhost:8080',
    theme: 'dark',
  },
};

/**
 * Initialize extension on install/update
 */
chrome.runtime.onInstalled.addListener(async details => {
  console.log('[Background] Extension installed/updated:', details.reason);

  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // Show welcome page on first install
    chrome.tabs.create({ url: 'popup.html' });

    // Initialize default settings
    const defaultSettings = {
      mode: 'polished',
      backendUrl: 'ws://localhost:8080',
      theme: 'dark',
      autoPolish: true,
      showConfirmation: true,
    };

    chrome.storage.local.set({ articulate_settings: defaultSettings });
  }
});

/**
 * Listen for messages from content script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Message received:', request.type);

  if (request.type === 'GET_SETTINGS') {
    chrome.storage.local.get('articulate_settings', data => {
      sendResponse({
        success: true,
        settings: data.articulate_settings || state.settings,
      });
    });
    // Indicate we'll send response asynchronously
    return true;
  }

  if (request.type === 'UPDATE_SETTINGS') {
    chrome.storage.local.set({ articulate_settings: request.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.type === 'LOG_EVENT') {
    // Log user analytics (locally, no external tracking for now)
    console.log('[Analytics]', request.event, request.data);
    sendResponse({ success: true });
    return true;
  }

  sendResponse({ success: false, error: 'Unknown request type' });
});

/**
 * Handle extension icon click
 */
chrome.action.onClicked.addListener(async tab => {
  console.log('[Background] Icon clicked on tab:', tab.id);
  // Could open a popup or perform an action
});

/**
 * Monitor tab changes
 */
chrome.tabs.onActivated.addListener(activeInfo => {
  console.log('[Background] Tab activated:', activeInfo.tabId);
});

console.log('[Background] Service worker initialized');
