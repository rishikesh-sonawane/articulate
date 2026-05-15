/**
 * Content Script for Articulate Extension
 * Injected on every page to provide voice-to-text functionality.
 */

const DEFAULT_SETTINGS = {
  mode: 'polished',
  backendUrl: 'http://localhost:8080',
  theme: 'dark',
  autoPolish: true,
  showConfirmation: true,
  transcriptionProvider: 'browser', // Default to browser speech recognition
  reconnectAttempts: 3,
  reconnectDelay: 1000,
};

class ArticulateController {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.recognition = null;
    this.recognitionTranscript = '';
    this.websocket = null;
    this.socketOpening = false;
    this.isRecording = false;
    this.currentField = null;
    this.pendingMessages = [];
    this.fieldSnapshot = null;
    this.lastFocusedField = null;
    this.savedSelectionRange = null;
    this.isFinalizing = false;
    this.observer = null;
    this.reconnectAttempt = 0;
    this.lastError = null;
    this.audioContext = null;
    this.analyser = null;
    this.audioLevelCallback = null;

    this.init();
  }

  async init() {
    console.log('[Articulate] Initializing content script');

    try {
      await this.loadSettings();
      this.injectUI();
      this.observeDOM();
      this.setupEventListeners();
      console.log('[Articulate] Initialization complete');
    } catch (error) {
      console.error('[Articulate] Initialization failed:', error);
    }
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
        if (response && response.success) {
          this.settings = { ...DEFAULT_SETTINGS, ...response.settings };
          console.log('[Articulate] Settings loaded:', this.settings);
        }
        resolve();
      });
    });
  }

  setupEventListeners() {
    document.addEventListener('keydown', (event) => this.handleKeydown(event));

    document.addEventListener('focusin', (event) => {
      if (this.isTextField(event.target)) {
        this.lastFocusedField = event.target;
        this.attachMicButton(event.target);
      }
    });

    // Handle visibility change to reconnect WebSocket if needed
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.websocket) {
        this.connectWebSocket();
      }
    });
  }

  injectUI() {
    // Clean up existing injected elements
    document.querySelectorAll('[data-articulate="true"]').forEach((container) => {
      const field = container.__articulateField;

      if (!field || !document.body.contains(field)) {
        container.remove();
      }
    });

    // Find and attach to text fields
    const candidates = Array.from(
      document.querySelectorAll(
        'input:not([type]), input[type="email"], input[type="search"], input[type="text"], input[type="url"], textarea, [contenteditable="true"]'
      )
    );

    console.log('[Articulate] Found', candidates.length, 'candidate fields');

    const fields = candidates.filter((field) => this.shouldAttachToField(field));
    console.log('[Articulate] Attaching to', fields.length, 'eligible fields');

    fields.forEach((field) => {
      console.log('[Articulate] Attaching to field:', field.tagName, field.className);
      this.attachMicButton(field);
    });
    this.dedupeMicButtons();
  }

  attachMicButton(field) {
    if (!this.isTextField(field) || field.hasAttribute('data-articulate-injected')) {
      return;
    }

    const host = this.getButtonHost(field);

    if (!host || this.hasNativeVoiceControl(host)) {
      return;
    }

    const container = document.createElement('span');
    container.className = 'articulate-mic-container';
    container.setAttribute('data-articulate', 'true');
    container.setAttribute('data-articulate-control', 'mic');
    container.__articulateField = field;

    const button = document.createElement('button');
    button.className = 'articulate-mic-button';
    button.type = 'button';
    button.innerHTML = this.getMicIcon();
    button.title = 'Click to speak (Ctrl+Shift+M)';
    button.setAttribute('aria-label', 'Voice input');
    button.setAttribute('aria-pressed', 'false');

    button.addEventListener('mousedown', (event) => {
      this.savedSelectionRange = this.getCurrentSelectionRange();
      event.preventDefault();
      event.stopPropagation();
    });

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleRecording(this.resolveTargetField(field));
    });

    container.appendChild(button);

    const position = window.getComputedStyle(host).position;
    if (position === 'static') {
      host.style.position = 'relative';
    }

    host.appendChild(container);
    field.setAttribute('data-articulate-injected', 'true');
    this.positionMicButton(field, container);
    this.dedupeMicButtons();
  }

  observeDOM() {
    // Debounce DOM observation to avoid excessive calls
    let debounceTimer = null;

    this.observer = new MutationObserver(() => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        window.requestAnimationFrame(() => this.injectUI());
      }, 100);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  handleKeydown(event) {
    // Ctrl+Shift+M or Cmd+Shift+M
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyM') {
      event.preventDefault();
      const activeField = document.activeElement;

      if (this.isTextField(activeField)) {
        this.savedSelectionRange = this.getCurrentSelectionRange();
        this.toggleRecording(activeField);
      }
    }
  }

  isTextField(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (element instanceof HTMLTextAreaElement) {
      return true;
    }

    if (element instanceof HTMLInputElement) {
      const editableTypes = new Set(['', 'email', 'search', 'text', 'url']);
      return editableTypes.has(element.type);
    }

    return element.isContentEditable;
  }

  shouldAttachToField(field) {
    if (!this.isTextField(field) || field.closest('[data-articulate="true"]')) {
      return false;
    }

    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      return !field.disabled && !field.readOnly && field.offsetParent !== null;
    }

    const childEditable = field.querySelector('[contenteditable="true"]');
    const parentEditable = field.parentElement?.closest('[contenteditable="true"]');
    const rect = field.getBoundingClientRect();
    const hasRealTextArea = rect.width >= 80 && rect.height >= 28;
    const host = this.getButtonHost(field);

    return !childEditable && !parentEditable && hasRealTextArea && !this.hasNativeVoiceControl(host);
  }

  getButtonHost(field) {
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      return field.parentElement;
    }

    return this.findStableEditorHost(field);
  }

  findStableEditorHost(field) {
    let host = field;
    let current = field.parentElement;

    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect();
      const style = window.getComputedStyle(current);
      const fieldRect = field.getBoundingClientRect();
      const isReasonableShell =
        rect.width >= fieldRect.width &&
        rect.width <= fieldRect.width + 240 &&
        rect.height >= fieldRect.height &&
        rect.height <= Math.max(fieldRect.height + 180, 72) &&
        style.display !== 'contents';

      if (isReasonableShell) {
        host = current;
      }

      current = current.parentElement;
    }

    return host;
  }

  hasNativeVoiceControl(host) {
    if (!host) {
      return false;
    }

    const selectors = [
      'button[aria-label*="mic" i]',
      'button[aria-label*="microphone" i]',
      'button[aria-label*="voice" i]',
      'button[aria-label*="dictat" i]',
      'button[title*="mic" i]',
      'button[title*="microphone" i]',
      'button[title*="voice" i]',
      'button[title*="dictat" i]',
      '[role="button"][aria-label*="mic" i]',
      '[role="button"][aria-label*="microphone" i]',
      '[role="button"][aria-label*="voice" i]',
      '[role="button"][aria-label*="dictat" i]',
    ];

    return selectors.some((selector) => {
      return Array.from(host.querySelectorAll(selector)).some((control) => {
        return !control.closest('[data-articulate="true"]');
      });
    });
  }

  dedupeMicButtons() {
    const containers = Array.from(document.querySelectorAll('[data-articulate="true"]'));
    const seenHosts = new WeakSet();

    containers.forEach((container) => {
      if (!container.querySelector('.articulate-mic-button')) {
        return;
      }

      const host = container.parentElement;

      if (!host || seenHosts.has(host)) {
        container.remove();
        return;
      }

      seenHosts.add(host);
    });
  }

  positionMicButton(field, container) {
    const host = container.parentElement;

    if (!host) {
      return;
    }

    const hostRect = host.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    const size = this.getButtonSize(fieldRect);

    container.style.setProperty('--articulate-button-size', `${size}px`);
    container.style.top = `${Math.max(6, fieldRect.top - hostRect.top + 6)}px`;
    container.style.right = `${Math.max(6, hostRect.right - fieldRect.right + 6)}px`;
  }

  getButtonSize(rect) {
    const shortestSide = Math.min(rect.width, rect.height || 36);
    return Math.max(24, Math.min(36, Math.round(shortestSide * 0.42)));
  }

  getMicIcon() {
    return `
      <svg class="articulate-mic-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/>
        <path d="M5 11a7 7 0 0 0 14 0"/>
        <path d="M12 18v3"/>
        <path d="M8 21h8"/>
      </svg>
      <span class="articulate-button-label">Voice input</span>
    `;
  }

  async toggleRecording(field) {
    if (this.isRecording) {
      this.stopRecording();
      return;
    }

    await this.startRecording(field);
  }

  async startRecording(field) {
    try {
      console.log('[Articulate] Starting recording');

      this.currentField = this.resolveTargetField(field);
      this.fieldSnapshot = this.captureFieldSnapshot(this.currentField);
      this.pendingMessages = [];
      this.recognitionTranscript = '';
      this.lastError = null;

      // Use browser speech recognition if configured
      if (this.settings.transcriptionProvider === 'browser' && this.canUseSpeechRecognition()) {
        this.startSpeechRecognition(field);
        return;
      }

      // Connect to backend
      await this.connectWebSocket();

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Set up audio analysis for level visualization
      this.setupAudioAnalyser();

      const recorderOptions = this.getRecorderOptions();
      this.mediaRecorder = new MediaRecorder(this.mediaStream, recorderOptions);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.sendMessage(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.sendMessage(JSON.stringify({ type: 'finalize', mode: this.settings.mode }));
        this.updateRecordingState(false, true);
      };

      this.mediaRecorder.start(1000);
      this.isRecording = true;
      this.updateRecordingState(true, false);
    } catch (error) {
      console.error('[Articulate] Failed to start recording:', error);
      this.cleanupRecording();

      // Provide specific error messages
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        this.showError('Microphone access denied. Please allow microphone access in your browser settings.');
      } else if (error.name === 'NotFoundError') {
        this.showError('No microphone found. Please connect a microphone and try again.');
      } else {
        this.showError(`Failed to start recording: ${error.message}`);
      }
    }
  }

  setupAudioAnalyser() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
    } catch (error) {
      console.warn('[Articulate] Audio analyser setup failed:', error);
    }
  }

  getAudioLevel() {
    if (!this.analyser) {
      return 0;
    }

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    const sum = dataArray.reduce((a, b) => a + b, 0);
    return sum / dataArray.length / 255;
  }

  stopRecording() {
    if (!this.isRecording) {
      return;
    }

    console.log('[Articulate] Stopping recording');
    this.isRecording = false;

    if (this.recognition) {
      this.isFinalizing = true;
      this.recognition.stop();
      this.updateRecordingState(false, true);
      return;
    }

    if (!this.mediaRecorder) {
      this.cleanupRecording();
      return;
    }

    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    this.stopMediaStream();
  }

  canUseSpeechRecognition() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  startSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    let finalTranscript = '';

    this.recognition.onresult = (event) => {
      let interimTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript.trim();

        if (event.results[index].isFinal) {
          finalTranscript = `${finalTranscript} ${transcript}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${transcript}`.trim();
        }
      }

      this.recognitionTranscript = `${finalTranscript} ${interimTranscript}`.trim();
      this.updateFieldWithTranscript(this.recognitionTranscript);
    };

    this.recognition.onerror = (event) => {
      console.error('[Articulate] Speech recognition error:', event.error);

      // Handle specific errors
      const errorMessages = {
        'no-speech': 'No speech detected. Please try again.',
        'audio-capture': 'Microphone not available.',
        'not-allowed': 'Microphone permission denied.',
        'network': 'Network error in speech recognition.',
      };

      const message = errorMessages[event.error] || `Speech recognition failed: ${event.error}`;
      this.showError(message);
    };

    this.recognition.onend = () => {
      if (this.isRecording && !this.isFinalizing) {
        try {
          this.recognition.start();
        } catch (error) {
          console.warn('[Articulate] Speech recognition restart failed:', error);
        }
        return;
      }

      this.finalizeRecognizedText(finalTranscript || this.recognitionTranscript);
    };

    this.recognition.start();
    this.isRecording = true;
    this.updateRecordingState(true, false);
  }

  async finalizeRecognizedText(text) {
    const transcript = text.trim();

    if (!transcript) {
      this.cleanupRecording();
      this.showError('No speech was detected');
      return;
    }

    if (this.settings.mode === 'raw') {
      this.insertFinalText(transcript);
      return;
    }

    try {
      const polishEndpoint = this.getPolishEndpoint();
      const response = await fetch(polishEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript }),
      });

      if (!response.ok) {
        throw new Error(`Polish request failed with ${response.status}`);
      }

      const result = await response.json();
      this.insertFinalText(result.polished || transcript);
    } catch (error) {
      console.warn('[Articulate] Polishing failed, inserting raw transcript:', error);
      this.insertFinalText(transcript);
    }
  }

  getPolishEndpoint() {
    return this.settings.backendUrl.replace(/\/$/, '') + '/api/polish';
  }

  getRecorderOptions() {
    // Prefer WebM with Opus codec
    if (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      return { mimeType: 'audio/webm;codecs=opus' };
    }

    if (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm')) {
      return { mimeType: 'audio/webm' };
    }

    // Fallback to any supported format
    return {};
  }

  async connectWebSocket() {
    // Check if already connected or connecting
    if (
      this.websocket &&
      (this.websocket.readyState === WebSocket.OPEN ||
        this.websocket.readyState === WebSocket.CONNECTING)
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        this.socketOpening = true;
        this.websocket = new WebSocket(`ws://localhost:8080`);

        // Set connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.socketOpening) {
            this.websocket.close();
            reject(new Error('Connection timeout'));
          }
        }, 5000);

        this.websocket.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('[Articulate] WebSocket connected');
          this.socketOpening = false;
          this.reconnectAttempt = 0;
          this.flushPendingMessages();
          resolve();
        };

        this.websocket.onmessage = (event) => this.handleSocketMessage(event);

        this.websocket.onerror = (error) => {
          console.error('[Articulate] WebSocket error:', error);
          this.lastError = error;
        };

        this.websocket.onclose = (event) => {
          console.log('[Articulate] WebSocket closed:', event.code, event.reason);
          this.socketOpening = false;

          // Attempt reconnection if not intentionally closed
          if (!event.wasClean && this.reconnectAttempt < this.settings.reconnectAttempts) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        console.error('[Articulate] Failed to connect:', error);
        this.socketOpening = false;
        reject(error);
      }
    });
  }

  attemptReconnect() {
    this.reconnectAttempt += 1;
    const delay = this.settings.reconnectDelay * Math.pow(2, this.reconnectAttempt - 1);

    console.log(`[Articulate] Attempting reconnect ${this.reconnectAttempt}/${this.settings.reconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      this.connectWebSocket().catch((error) => {
        console.error('[Articulate] Reconnection failed:', error);
      });
    }, delay);
  }

  sendMessage(message) {
    // Try to send immediately if connected
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(message);
      return;
    }

    // Queue message for later
    this.pendingMessages.push(message);

    // Try to reconnect if not connected
    if (!this.websocket || this.websocket.readyState === WebSocket.CLOSED) {
      this.connectWebSocket().catch((error) => {
        console.error('[Articulate] Failed to send message:', error);
        this.showError('Failed to connect to backend');
      });
    }
  }

  flushPendingMessages() {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }

    const messages = this.pendingMessages.splice(0);
    messages.forEach((message) => {
      try {
        this.websocket.send(message);
      } catch (error) {
        console.error('[Articulate] Failed to send pending message:', error);
      }
    });
  }

  handleSocketMessage(event) {
    let message;

    try {
      message = JSON.parse(event.data);
    } catch (error) {
      console.error('[Articulate] Invalid server message:', event.data);
      return;
    }

    console.log('[Articulate] Message received:', message.type);

    switch (message.type) {
      case 'partial_text':
        if (message.text) {
          this.updateFieldWithTranscript(message.text);
        }
        break;

      case 'final_text':
        if (this.settings.mode === 'raw') {
          this.insertFinalText(message.text);
        }
        break;

      case 'polished_text':
        if (this.settings.mode !== 'raw') {
          this.insertFinalText(message.text);
        }
        break;

      case 'connected':
        console.log('[Articulate] Server acknowledged connection:', message.clientId);
        break;

      case 'error':
        console.error('[Articulate] Server error:', message);
        this.showError(message.message || 'Server error occurred');
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.log('[Articulate] Unknown message type:', message.type);
    }
  }

  captureFieldSnapshot(field) {
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      return {
        type: 'input',
        value: field.value,
        start: field.selectionStart ?? field.value.length,
        end: field.selectionEnd ?? field.value.length,
      };
    }

    return {
      type: 'contenteditable',
      value: field.textContent || '',
      start: null,
      end: null,
    };
  }

  updateFieldWithTranscript(text) {
    if (!this.currentField || !this.fieldSnapshot || !this.isRecording) {
      return;
    }

    // Don't update contenteditable during live recording
    if (this.isContentEditableField(this.currentField)) {
      return;
    }

    this.writeTextToField(this.currentField, text, false);
  }

  insertFinalText(text) {
    const targetField = this.resolveTargetField(this.currentField);

    if (!targetField) {
      this.cleanupRecording();
      this.showError('No active text field found');
      return;
    }

    const inserted = this.writeTextToField(targetField, text, true);
    this.cleanupRecording();

    if (inserted) {
      this.showSuccess('Text inserted');
    } else {
      this.showError('Text could not be inserted');
    }
  }

  writeTextToField(field, text, isFinal) {
    const snapshot = this.fieldSnapshot || this.captureFieldSnapshot(field);

    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      const before = snapshot.value.slice(0, snapshot.start);
      const after = snapshot.value.slice(snapshot.end);
      const separator = before && !before.endsWith(' ') && text ? ' ' : '';
      const nextValue = `${before}${separator}${text}${after}`;
      const cursor = before.length + separator.length + text.length;

      field.value = nextValue;
      field.selectionStart = cursor;
      field.selectionEnd = cursor;
    } else {
      const inserted = this.insertIntoContentEditable(field, text);
      if (!inserted) {
        return false;
      }
    }

    // Trigger input events for frameworks that track changes
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));

    if (isFinal) {
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return true;
  }

  placeCaretAtEnd(element) {
    element.focus();

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  insertIntoContentEditable(element, text) {
    element.focus();

    this.restoreSelectionForElement(element);

    const before = element.textContent || '';
    const commandInserted = document.execCommand('insertText', false, text);
    const after = element.textContent || '';

    if (!commandInserted || after === before) {
      const currentText = element.textContent || '';
      element.textContent = `${currentText}${currentText ? ' ' : ''}${text}`;
      this.placeCaretAtEnd(element);
    }

    return (element.textContent || '').includes(text);
  }

  restoreSelectionForElement(element) {
    const selection = window.getSelection();

    if (
      this.savedSelectionRange &&
      element.contains(this.savedSelectionRange.commonAncestorContainer)
    ) {
      selection.removeAllRanges();
      selection.addRange(this.savedSelectionRange);
      return;
    }

    // Fallback: place at end
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  resolveTargetField(preferredField) {
    // First priority: active element if it's a text field
    const activeField = document.activeElement;
    if (this.isTextField(activeField)) {
      return activeField;
    }

    // Second priority: field from selection
    const selectionField = this.getFieldFromSelection();
    if (selectionField) {
      return selectionField;
    }

    // Third priority: last focused field
    if (this.isTextField(this.lastFocusedField)) {
      return this.lastFocusedField;
    }

    // Fallback: preferred field
    return preferredField;
  }

  getFieldFromSelection() {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const node =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;

    if (!node) {
      return null;
    }

    const field = node.closest('[contenteditable="true"], textarea, input');
    return this.isTextField(field) ? field : null;
  }

  getCurrentSelectionRange() {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    return selection.getRangeAt(0).cloneRange();
  }

  isContentEditableField(element) {
    return element instanceof HTMLElement && element.isContentEditable;
  }

  updateRecordingState(isRecording, isProcessing) {
    const buttons = document.querySelectorAll('.articulate-mic-button');

    buttons.forEach((button) => {
      button.classList.toggle('recording', isRecording);
      button.classList.toggle('processing', isProcessing);
      button.setAttribute('aria-pressed', isRecording ? 'true' : 'false');
      button.title = isRecording
        ? 'Stop recording'
        : isProcessing
          ? 'Processing speech'
          : 'Click to speak (Ctrl+Shift+M)';
      button.disabled = isProcessing;
    });
  }

  cleanupRecording() {
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recognition = null;
    this.recognitionTranscript = '';
    this.isFinalizing = false;
    this.fieldSnapshot = null;

    // Clean up audio context
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;

    this.stopMediaStream();
    this.updateRecordingState(false, false);
  }

  stopMediaStream() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.mediaStream = null;
    }
  }

  showError(message) {
    this.cleanupRecording();
    this.showNotification(message, 'error');

    // Log error for debugging
    console.error('[Articulate] Error:', message);
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showNotification(message, type) {
    const existing = document.querySelector('.articulate-notification');
    if (existing) {
      existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = `articulate-notification articulate-${type}`;
    notification.textContent = message;
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'polite');

    document.body.appendChild(notification);

    // Trigger reflow for animation
    void notification.offsetWidth;

    window.setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ArticulateController();
  });
} else {
  new ArticulateController();
}

console.log('[Articulate] Content script loaded');