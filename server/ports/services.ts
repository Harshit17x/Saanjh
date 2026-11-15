/** Ports for the outside world other than storage. */

export interface Clock {
  now(): number;
}

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

export interface AiImage {
  mimeType: string;
  data: string;
}

export interface AiRequest {
  system: string;
  prompt: string;
  /** JSON Schema the model's output must follow. */
  schema: Record<string, unknown>;
  image?: AiImage;
}

/** Generates JSON from a model. Throws on transport failure or timeout. */
export interface AiClient {
  readonly available: boolean;
  generateJson(request: AiRequest): Promise<unknown>;
}

/** Verifies the bearer credential on the internal reminder endpoints. */
export type TriggerVerifier = (authorization: string | undefined) => Promise<boolean>;

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export const systemClock: Clock = { now: () => Date.now() };
