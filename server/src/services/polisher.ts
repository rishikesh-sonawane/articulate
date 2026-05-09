/**
 * Text Polishing (LLM) service interface and implementations
 */

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
    private model: string = 'gpt-3.5-turbo'
  ) {}

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

      const userPrompt = `Polish this transcript into well-formed text:

"${transcript}"${toneInstruction}`;

      // TODO: Implement actual OpenAI API call
      // const response = await fetch('https://api.openai.com/v1/chat/completions', {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${this.apiKey}`,
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     model: this.model,
      //     messages: [
      //       { role: 'system', content: this.systemPrompt },
      //       { role: 'user', content: userPrompt },
      //     ],
      //     temperature: 0.7,
      //     max_tokens: 500,
      //   }),
      // });

      // Mock response for now
      const polished = 'Hello, team. I believe we need to refactor the authentication module.';
      return polished;
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

    // Simple mock: capitalize and add period
    let polished = transcript.trim();
    if (polished && !polished.endsWith('.')) {
      polished += '.';
    }
    return polished.charAt(0).toUpperCase() + polished.slice(1);
  }
}
