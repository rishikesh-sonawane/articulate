/**
 * Content Script for Articulate Extension
 * Injected on every page to provide voice-to-text functionality
 */

interface Settings {
  mode: 'raw' | 'polished';
  backendUrl: string;
  theme: 'dark' | 'light';
  autoPolish?: boolean;
  showConfirmation?: boolean;
}

class ArticulateController {
  private settings: Settings;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private websocket: WebSocket | null = null;
  private isRecording = false;
  private currentField: HTMLInputElement | HTMLTextAreaElement | null = null;
  private audioChunks: Blob[] = [];

  constructor() {
    this.settings = {
      mode: 'polished',
      backendUrl: 'ws://localhost:8080',
      theme: 'dark',
    };
    this.init();
  }

  private async init(): Promise<void> {
    console.log('[Articulate] Initializing content script');

    // Load settings from storage
    this.loadSettings();

    // Inject UI into all text fields
    this.injectUI();

    // Monitor for dynamically added fields
    this.observeDOM();

    // Listen for keyboard shortcut
    document.addEventListener('keydown', e => this.handleKeydown(e));
  }

  private loadSettings(): void {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, response => {
      if (response.success) {
        this.settings = response.settings;
        console.log('[Articulate] Settings loaded:', this.settings);
      }
    });
  }

  private injectUI(): void {
    // Find all text input fields
    const inputs = document.querySelectorAll(
      'input[type="text"], textarea, [contenteditable="true"]'
    );

    inputs.forEach(field => {
      if (!field.hasAttribute('data-articulate-injected')) {
        this.attachMicButton(field as HTMLElement);
      }
    });
  }

  private attachMicButton(field: HTMLElement): void {
    // Create mic button container
    const container = document.createElement('div');
    container.className = 'articulate-mic-container';
    container.setAttribute('data-articulate', 'true');

    const button = document.createElement('button');
    button.className = 'articulate-mic-button';
    button.type = 'button';
    button.innerHTML = '🎙️';
    button.title = 'Click to speak (Ctrl+Shift+M)';
    button.setAttribute('aria-label', 'Voice input');

    // Handle click
    button.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleRecording(field as HTMLInputElement | HTMLTextAreaElement);
    });

    container.appendChild(button);

    // Insert near the field
    if (field.parentElement) {
      field.parentElement.style.position = 'relative';
      field.parentElement.appendChild(container);
      field.setAttribute('data-articulate-injected', 'true');
    }
  }

  private observeDOM(): void {
    const observer = new MutationObserver(() => {
      this.injectUI();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private handleKeydown(event: KeyboardEvent): void {
    // Ctrl+Shift+M or Cmd+Shift+M to toggle voice
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyM') {
      event.preventDefault();
      const activeField = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
      if (activeField && this.isTextField(activeField)) {
        this.toggleRecording(activeField);
      }
    }
  }

  private isTextField(element: any): boolean {
    return (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLElement && element.contentEditable === 'true')
    );
  }

  private async toggleRecording(field: HTMLInputElement | HTMLTextAreaElement): Promise<void> {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording(field);
    }
  }

  private async startRecording(field: HTMLInputElement | HTMLTextAreaElement): Promise<void> {
    try {
      console.log('[Articulate] Starting recording');

      // Request microphone permission
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create media recorder
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: 'audio/webm',
      });

      this.audioChunks = [];
      this.currentField = field;
      this.isRecording = true;

      // Handle data available
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        this.audioChunks.push(event.data);
        this.sendAudioChunk(event.data);
      };

      // Handle stop
      this.mediaRecorder.onstop = async () => {
        await this.finalizeRecording();
      };

      // Start recording (emit data every 1 second)
      this.mediaRecorder.start(1000);

      // Update UI to show recording state
      this.updateRecordingState(true);
    } catch (error) {
      console.error('[Articulate] Failed to start recording:', error);
      this.showError('Microphone access denied');
    }
  }

  private stopRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      console.log('[Articulate] Stopping recording');
      this.isRecording = false;
      this.mediaRecorder.stop();

      // Stop media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      // Signal finalize to backend
      this.websocket?.send(JSON.stringify({ type: 'finalize' }));

      // Update UI
      this.updateRecordingState(false);
    }
  }

  private sendAudioChunk(chunk: Blob): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      this.connectWebSocket();
    }

    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(chunk);
    }
  }

  private connectWebSocket(): void {
    try {
      this.websocket = new WebSocket(this.settings.backendUrl);

      this.websocket.onopen = () => {
        console.log('[Articulate] WebSocket connected');
      };

      this.websocket.onmessage = (event: MessageEvent) => {
        const message = JSON.parse(event.data);
        console.log('[Articulate] Message received:', message.type);

        if (message.type === 'partial_text') {
          this.updateFieldWithPartial(message.text);
        } else if (message.type === 'final_text') {
          console.log('[Articulate] Final transcript:', message.text);
        } else if (message.type === 'polished_text') {
          this.insertFinalText(message.text);
        } else if (message.type === 'error') {
          this.showError(message.message || 'An error occurred');
        }
      };

      this.websocket.onerror = error => {
        console.error('[Articulate] WebSocket error:', error);
        this.showError('Connection failed');
      };

      this.websocket.onclose = () => {
        console.log('[Articulate] WebSocket closed');
      };
    } catch (error) {
      console.error('[Articulate] Failed to connect:', error);
      this.showError('Failed to connect to backend');
    }
  }

  private updateFieldWithPartial(text: string): void {
    if (this.currentField && this.isRecording) {
      this.currentField.value = text;
      this.currentField.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  private insertFinalText(text: string): void {
    if (!this.currentField) return;

    this.currentField.value = text;
    this.currentField.dispatchEvent(new Event('input', { bubbles: true }));
    this.currentField.dispatchEvent(new Event('change', { bubbles: true }));

    console.log('[Articulate] Text inserted:', text);
    this.showSuccess('Text polished and inserted');
  }

  private async finalizeRecording(): Promise<void> {
    console.log('[Articulate] Finalizing recording');
    // WebSocket will handle the rest
  }

  private updateRecordingState(isRecording: boolean): void {
    const buttons = document.querySelectorAll('.articulate-mic-button');
    buttons.forEach(btn => {
      if (isRecording) {
        btn.classList.add('recording');
        btn.innerHTML = '⏹️';
        btn.style.backgroundColor = '#ff4444';
      } else {
        btn.classList.remove('recording');
        btn.innerHTML = '🎙️';
        btn.style.backgroundColor = '';
      }
    });
  }

  private showError(message: string): void {
    this.showNotification(message, 'error');
  }

  private showSuccess(message: string): void {
    this.showNotification(message, 'success');
  }

  private showNotification(message: string, type: 'error' | 'success'): void {
    const notification = document.createElement('div');
    notification.className = `articulate-notification articulate-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      background: ${type === 'error' ? '#ff4444' : '#44ff44'};
      color: white;
      border-radius: 4px;
      font-size: 14px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ArticulateController();
  });
} else {
  new ArticulateController();
}

console.log('[Articulate] Content script loaded');
