/**
 * Text Polishing (LLM) service - using OpenCode.ai (Anthropic-compatible)
 */

export interface IPolisher {
  polish(transcript: string, options?: PolishOptions): Promise<string>;
}

export interface PolishOptions {
  tone?: 'professional' | 'casual' | 'friendly';
  maxLength?: number;
  removeFillers?: boolean;
}

/**
 * OpenCode.ai Polisher (Anthropic-compatible API)
 */
export class OpenCodePolisher implements IPolisher {
  private apiKey: string;
  private model: string;
  private baseUrl = 'https://opencode.ai/zen';

  constructor(apiKey: string, model: string = 'minimax-m2.5-free') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async polish(transcript: string, options: PolishOptions = {}): Promise<string> {
    if (!transcript || !transcript.trim()) {
      return '';
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: options.maxLength || 500,
          messages: [
            { role: 'user', content: 'You are a professional text editor. Transform raw speech into polished, professional text. Remove filler words (um, uh, like, you know, basically, actually), fix grammar and punctuation, reframe for clarity, and keep the original meaning. Return ONLY the polished text.\n\nInput: ' + transcript.trim() }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
      const textBlock = data.content?.find((block) => block.type === 'text');
      const polished = textBlock?.text?.trim() || transcript;
      return this.postProcess(polished);
    } catch (error) {
      console.error('[OpenCode] Polishing error:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  private postProcess(text: string): string {
    let cleaned = text.replace(/^["']|["']$/g, '').trim();
    if (cleaned && !/[.!?]$/.test(cleaned)) {
      cleaned += '.';
    }
    return cleaned.replace(/\s+/g, ' ');
  }
}

/**
 * Mock Polisher for testing and development
 */
export class MockPolisher implements IPolisher {
  async polish(transcript: string, _options?: PolishOptions): Promise<string> {
    // Simulate API latency
    await this.sleep(100);

    if (!transcript || !transcript.trim()) {
      return '';
    }

    let polished = transcript.trim();

    // Remove filler words (more comprehensive)
    const fillers = /\b(um|uh|erm|ah|like|basically|actually|you know|i mean|so yeah|i guess|right|you see|i suppose)\b[,\s]*/gi;
    polished = polished.replace(fillers, '');

    // Fix repeated consecutive words (like "this is an announcement this is an announcement")
    polished = polished.replace(/\b(\w+)\s+\1\b/gi, '$1');

    // Fix double phrases (like "this is an announcement this is an announcement")
    polished = polished.replace(/(.+?)\s+\1/gi, '$1');

    // Fix spacing before punctuation
    polished = polished.replace(/\s+([,.!?])/g, '$1');

    // Fix multiple spaces
    polished = polished.replace(/\s{2,}/g, ' ');

    // Capitalize first letter
    if (polished) {
      polished = polished.charAt(0).toUpperCase() + polished.slice(1);
    }

    // Fix capitalization after periods
    polished = polished.replace(/([.!?])\s+([a-z])/g, (match, punct, letter) => {
      return punct + ' ' + letter.toUpperCase();
    });

    // Ensure ends with punctuation
    if (polished && !/[.!?]$/.test(polished)) {
      polished += '.';
    }

    // Fix common speech-to-text errors
    polished = polished
      .replace(/\bIve\b/gi, "I've")
      .replace(/\bdont\b/gi, "don't")
      .replace(/\bcant\b/gi, "can't")
      .replace(/\bwont\b/gi, "won't")
      .replace(/\bim\b/gi, "I'm")
      .replace(/\blets\b/gi, "let's")
      .replace(/\bthats\b/gi, "that's")
      .replace(/\bwhats\b/gi, "what's")
      .replace(/\bive\b/gi, "I've")
      .replace(/\byoure\b/gi, "you're")
      .replace(/\btheyre\b/gi, "they're")
      .replace(/\bweve\b/gi, "we've");

    return polished.trim();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}