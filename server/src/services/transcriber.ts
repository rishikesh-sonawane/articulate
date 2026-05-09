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
}

/**
 * Whisper API implementation
 */
export class WhisperTranscriber implements ITranscriber {
  private buffer: Buffer[] = [];
  private client: OpenAI;
  private sessionId: string;

  constructor(private apiKey: string, private model: string = 'whisper-1') {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when NODE_ENV=production');
    }

    this.client = new OpenAI({
      apiKey,
      timeout: 60 * 1000,
      maxRetries: 1,
    });
    this.sessionId = this.generateSessionId();
  }

  async transcribeChunk(audioData: Buffer): Promise<string> {
    try {
      // Buffer audio chunks
      this.buffer.push(audioData);

      return '';
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`Transcription failed: ${error}`);
    }
  }

  async finalizeTranscription(): Promise<string> {
    try {
      if (this.buffer.length === 0) {
        return '';
      }

      // Merge all audio chunks into one webm file captured by MediaRecorder.
      const totalLength = this.buffer.reduce((sum, buf) => sum + buf.length, 0);
      const mergedAudio = Buffer.concat(this.buffer, totalLength);

      const file = await toFile(mergedAudio, `${this.sessionId}.webm`, {
        type: 'audio/webm',
      });

      const transcription = await this.client.audio.transcriptions.create({
        file,
        model: this.model,
        language: 'en',
        response_format: 'text',
      });

      const transcript =
        typeof transcription === 'string'
          ? transcription
          : String(transcription);

      this.reset();
      return transcript.trim();
    } catch (error) {
      console.error('Finalization error:', error);
      throw new Error(`Transcription finalization failed: ${error}`);
    }
  }

  reset(): void {
    this.buffer = [];
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Mock Transcriber for testing (uses Web Speech API or local model)
 */
export class MockTranscriber implements ITranscriber {
  private transcript: string = '';
  private mockResponses = [
    'Hello team',
    'I think we need to refactor',
    'the authentication module',
  ];
  private responseIndex = 0;

  async transcribeChunk(audioData: Buffer): Promise<string> {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 50));

    if (this.responseIndex < this.mockResponses.length) {
      const response = this.mockResponses[this.responseIndex];
      this.transcript += (this.transcript ? ' ' : '') + response;
      this.responseIndex++;
      return this.transcript;
    }

    return this.transcript;
  }

  async finalizeTranscription(): Promise<string> {
    return this.transcript;
  }

  reset(): void {
    this.transcript = '';
    this.responseIndex = 0;
  }
}
