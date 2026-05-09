/**
 * Speech-to-Text (ASR) service interface and implementations
 */

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
  private sessionId: string;

  constructor(private apiKey: string, private model: string = 'small') {
    this.sessionId = this.generateSessionId();
  }

  async transcribeChunk(audioData: Buffer): Promise<string> {
    try {
      // Buffer audio chunks
      this.buffer.push(audioData);

      // TODO: Implement streaming transcription
      // For now, accumulate chunks and transcribe when finalized
      // In production, use Whisper API streaming endpoint

      return `[Processing audio chunk... total ${this.buffer.length} chunks]`;
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

      // Merge all audio chunks
      const totalLength = this.buffer.reduce((sum, buf) => sum + buf.length, 0);
      const mergedAudio = Buffer.concat(this.buffer, totalLength);

      // TODO: Call Whisper API with merged audio
      // const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      //   method: 'POST',
      //   headers: { 'Authorization': `Bearer ${this.apiKey}` },
      //   body: formData (with merged audio),
      // });

      // Mock response for now
      const transcript = 'Hello world, team. I think we need to refactor the authentication module.';
      this.reset();
      return transcript;
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
