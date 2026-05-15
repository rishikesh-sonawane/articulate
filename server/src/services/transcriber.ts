/**
 * Speech-to-Text (ASR) service interface and implementations
 */

import OpenAI, { toFile } from 'openai';

export interface ITranscriber {
  /**
   * Transcribe a single audio chunk
   * @param audioData Raw audio buffer
   * @returns Promise<string> Partial transcript
   */
  transcribeChunk(audioData: Buffer): Promise<string>;

  /**
   * Finalize and get the complete transcript
   * @returns Promise<string> Final transcript
   */
  finalizeTranscription(): Promise<string>;

  /**
   * Reset the transcriber state for a new session
   */
  reset(): void;

  /**
   * Get the number of buffered chunks
   */
  getBufferSize(): number;
}

/**
 * Whisper API implementation
 */
export class WhisperTranscriber implements ITranscriber {
  private buffer: Buffer[] = [];
  private client: OpenAI;
  private sessionId: string;
  private readonly timeout: number;

  constructor(
    private apiKey: string,
    private model: string = 'whisper-1',
    timeout: number = 60000
  ) {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when NODE_ENV=production');
    }

    this.client = new OpenAI({
      apiKey,
      timeout,
      maxRetries: 2,
    });
    this.sessionId = this.generateSessionId();
    this.timeout = timeout;
  }

  async transcribeChunk(audioData: Buffer): Promise<string> {
    try {
      // Buffer audio chunks for later processing
      this.buffer.push(audioData);

      // In streaming mode, we don't transcribe immediately
      // We accumulate and transcribe on finalize
      return '';
    } catch (error) {
      console.error('[Whisper] Transcription error:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async finalizeTranscription(): Promise<string> {
    if (this.buffer.length === 0) {
      console.log('[Whisper] No audio data to transcribe');
      return '';
    }

    try {
      console.log(`[Whisper] Transcribing ${this.buffer.length} chunks (${this.getBufferSize()} bytes)`);

      // Merge all audio chunks
      const totalLength = this.buffer.reduce((sum, buf) => sum + buf.length, 0);
      const mergedAudio = Buffer.concat(this.buffer, totalLength);

      // Determine mime type based on audio data
      // WebM typically starts with fLaC or something similar
      const mimeType = this.detectMimeType(mergedAudio);

      const file = await toFile(mergedAudio, `${this.sessionId}.webm`, {
        type: mimeType,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const transcription = await this.client.audio.transcriptions.create(
          {
            file,
            model: this.model,
            language: 'en',
            response_format: 'text',
            temperature: 0.2,
          },
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        const transcript =
          typeof transcription === 'string'
            ? transcription
            : String(transcription);

        this.reset();
        console.log(`[Whisper] Transcription complete: "${transcript.substring(0, 100)}..."`);
        return transcript.trim();
      } catch (innerError) {
        clearTimeout(timeoutId);
        throw innerError;
      }
    } catch (error) {
      console.error('[Whisper] Finalization error:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error(`Transcription finalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  reset(): void {
    this.buffer = [];
    this.sessionId = this.generateSessionId();
  }

  getBufferSize(): number {
    return this.buffer.reduce((sum, buf) => sum + buf.length, 0);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private detectMimeType(buffer: Buffer): string {
    // Check for WebM magic bytes
    if (buffer.length >= 4) {
      // WebM files typically start with EBML header (0x1A 0x45 0xDF 0xA3)
      if (buffer[0] === 0x1a && buffer[1] === 0x45) {
        return 'audio/webm';
      }
      // RIFF header (WAV)
      if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
        return 'audio/wav';
      }
      // MP3/MP4 audio
      if (buffer[0] === 0x66 && buffer[1] === 0x74 && buffer[2] === 0x79 && buffer[3] === 0x70) {
        return 'audio/mp4';
      }
    }
    // Default to WebM since that's what browsers typically produce
    return 'audio/webm';
  }
}

/**
 * Mock Transcriber for testing and development
 */
export class MockTranscriber implements ITranscriber {
  private transcript: string = '';
  private mockResponses = [
    'Recording captured',
  ];
  private responseIndex = 0;
  private buffer: Buffer[] = [];

  async transcribeChunk(audioData: Buffer): Promise<string> {
    // Buffer the audio data
    this.buffer.push(audioData);

    // Simulate processing time
    await this.sleep(50);

    if (this.responseIndex < this.mockResponses.length) {
      const response = this.mockResponses[this.responseIndex];
      this.transcript += (this.transcript ? ' ' : '') + response;
      this.responseIndex++;
      return this.transcript;
    }

    return this.transcript;
  }

  async finalizeTranscription(): Promise<string> {
    if (this.buffer.length === 0) {
      return '';
    }

    // Simulate more realistic behavior
    if (this.transcript) {
      // Add punctuation
      this.transcript = this.transcript.replace(/([a-z])$/i, '$1.');
    }

    const result = this.transcript;
    this.reset();
    return result;
  }

  reset(): void {
    this.transcript = '';
    this.responseIndex = 0;
    this.buffer = [];
  }

  getBufferSize(): number {
    return this.buffer.reduce((sum, buf) => sum + buf.length, 0);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}