/**
 * Text Polishing (LLM) service interface and implementations
 */

import OpenAI from 'openai';

export interface IPolisher {
  /**
   * Polish a transcript into well-formed text
   * @param transcript Raw transcribed text
   * @param options Optional polishing options
   * @returns Promise<string> Polished text
   */
  polish(
    transcript: string,
    options?: PolishOptions
  ): Promise<string>;
}

export interface PolishOptions {
  tone?: 'professional' | 'casual' | 'friendly';
  maxLength?: number;
  removeFillers?: boolean;
}

/**
 * GPT-based Polisher implementation
 */
export class GPTPolisher implements IPolisher {
  private client: OpenAI;
  private systemPrompt = `You are an expert text editor. Your job is to transform raw spoken transcripts into polished, professional writing.

Instructions:
1. Remove all filler words: "um", "uh", "like", "you know", "basically"
2. Fix grammar, punctuation, and capitalization
3. Rephrase awkward sentence structures
4. Keep the original meaning - do NOT add new information
5. Keep the response concise and clear
6. Match the requested tone if specified`;

  constructor(
    private apiKey: string,
    private model: string = 'gpt-4o-mini'
  ) {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when NODE_ENV=production');
    }

    this.client = new OpenAI({
      apiKey,
      timeout: 20 * 1000,
      maxRetries: 1,
    });
  }

  async polish(
    transcript: string,
    options: PolishOptions = {}
  ): Promise<string> {
    if (!transcript.trim()) {
      return '';
    }

    try {
      const toneInstruction =
        options.tone && options.tone !== 'professional'
          ? `\nTone: Write in a ${options.tone} manner.`
          : '';

      const userPrompt = `Polish this spoken transcript into clear, ready-to-send writing.
Return only the polished text. Do not wrap it in quotes.

"${transcript}"${toneInstruction}`;

      const response = await this.client.responses.create({
        model: this.model,
        instructions: this.systemPrompt,
        input: userPrompt,
        temperature: 0.3,
        max_output_tokens: options.maxLength || 500,
      });

      return response.output_text.trim();
    } catch (error) {
      console.error('Polishing error:', error);
      throw new Error(`Text polishing failed: ${error}`);
    }
  }
}

/**
 * Mock Polisher for testing
 */
export class MockPolisher implements IPolisher {
  async polish(
    transcript: string,
    options?: PolishOptions
  ): Promise<string> {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    let polished = transcript
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b(um|uh|erm|ah|like|basically|actually|you know|i mean)\b[,\s]*/gi, '')
      .replace(/\b(\w+)(\s+\1\b)+/gi, '$1')
      .replace(/\bi\b/g, 'I')
      .replace(/\bim\b/gi, "I'm")
      .replace(/\bdont\b/gi, "don't")
      .replace(/\bcant\b/gi, "can't")
      .replace(/\bwont\b/gi, "won't")
      .replace(/\blets\b/gi, "let's")
      .replace(/\s+([,.!?])/g, '$1')
      .trim();

    polished = this.capitalizeSentences(polished);

    if (polished && !/[.!?]$/.test(polished)) {
      polished += '.';
    }

    return polished;
  }

  private capitalizeSentences(text: string): string {
    return text.replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix: string, letter: string) => {
      return `${prefix}${letter.toUpperCase()}`;
    });
  }
}
