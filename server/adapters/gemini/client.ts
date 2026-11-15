import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { AiClient, AiRequest, Logger } from '../../ports/services';

/** Per-call budget. A slow model must never block the person using the app. */
export const AI_TIMEOUT_MS = 12_000;

class TimeoutError extends Error {
  constructor() {
    super('Gemini request timed out');
    this.name = 'TimeoutError';
  }
}

/**
 * Gemini adapter: JSON-only structured output with low thinking for speed.
 * Tries the primary model, then the fallback model if the primary fails for
 * a reason other than a timeout (e.g. quota or an unavailable model).
 */
export class GeminiClient implements AiClient {
  readonly available = true;
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly models: readonly string[],
    private readonly logger: Logger,
    private readonly timeoutMs = AI_TIMEOUT_MS,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  private async call(model: string, request: AiRequest): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    try {
      const parts = request.image
        ? [
            { inlineData: { mimeType: request.image.mimeType, data: request.image.data } },
            { text: request.prompt },
          ]
        : [{ text: request.prompt }];
      const response = await this.ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: request.system,
          responseMimeType: 'application/json',
          responseJsonSchema: request.schema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: controller.signal,
        },
      });
      const usage = response.usageMetadata;
      this.logger.info('gemini call', {
        model,
        ms: Date.now() - started,
        inputTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
      });
      return JSON.parse(response.text ?? '') as unknown;
    } catch (error) {
      if (controller.signal.aborted) throw new TimeoutError();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async generateJson(request: AiRequest): Promise<unknown> {
    let lastError: unknown = new Error('No Gemini model configured');
    for (const model of this.models) {
      try {
        return await this.call(model, request);
      } catch (error) {
        lastError = error;
        this.logger.warn('gemini call failed', { model, error: String(error) });
        if (error instanceof TimeoutError) break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

/** Used when no API key is configured: every AI feature falls back to rules. */
export const unavailableAi: AiClient = {
  available: false,
  generateJson: () => Promise.reject(new Error('Gemini is not configured')),
};
