import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));
const verifyIdToken = vi.fn();

vi.mock('@google/genai', () => ({
  ThinkingLevel: { LOW: 'LOW' },
  GoogleGenAI: class {
    models = { generateContent };
  },
}));
vi.mock('nodemailer', () => ({ default: { createTransport } }));
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

const { GeminiClient, unavailableAi } = await import('../../server/adapters/gemini/client');
const { GmailMailer, LogMailer } = await import('../../server/adapters/gmail/mailer');
const { schedulerOidcVerifier } = await import('../../server/security/trigger');

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const request = { system: 'sys', prompt: 'p', schema: { type: 'object' } };

beforeEach(() => {
  generateContent.mockReset();
  sendMail.mockReset();
  verifyIdToken.mockReset();
});

describe('GeminiClient', () => {
  it('requests JSON output and parses the text', async () => {
    generateContent.mockResolvedValue({
      text: '{"ok":true}',
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 },
    });
    const client = new GeminiClient('key', ['primary', 'fallback'], logger);
    expect(client.available).toBe(true);
    expect(
      await client.generateJson({ ...request, image: { mimeType: 'image/jpeg', data: 'AAAA' } }),
    ).toEqual({ ok: true });
    const call = generateContent.mock.calls[0]![0];
    expect(call.model).toBe('primary');
    expect(call.config).toMatchObject({
      systemInstruction: 'sys',
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object' },
    });
    expect(call.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } });
    expect(logger.info).toHaveBeenCalledWith(
      'gemini call',
      expect.objectContaining({ model: 'primary', inputTokens: 10 }),
    );
  });

  it('falls back to the second model when the first fails', async () => {
    generateContent.mockRejectedValueOnce(new Error('404 model')).mockResolvedValueOnce({ text: '{"n":1}' });
    const client = new GeminiClient('key', ['primary', 'fallback'], logger);
    expect(await client.generateJson(request)).toEqual({ n: 1 });
    expect(generateContent.mock.calls[1]![0].model).toBe('fallback');
  });

  it('throws the last error when every model fails, including unparseable text', async () => {
    generateContent.mockResolvedValue({ text: undefined });
    await expect(new GeminiClient('key', ['a', 'b'], logger).generateJson(request)).rejects.toThrow(
      SyntaxError,
    );
    generateContent.mockRejectedValue('plain string');
    await expect(new GeminiClient('key', ['a'], logger).generateJson(request)).rejects.toThrow(
      'plain string',
    );
    await expect(new GeminiClient('key', [], logger).generateJson(request)).rejects.toThrow(
      'No Gemini model configured',
    );
  });

  it('stops after a timeout instead of trying the fallback', async () => {
    generateContent.mockImplementation(
      ({ config }: { config: { abortSignal: AbortSignal } }) =>
        new Promise((_resolve, reject) => {
          config.abortSignal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const client = new GeminiClient('key', ['primary', 'fallback'], logger, 10);
    await expect(client.generateJson(request)).rejects.toThrow('Gemini request timed out');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('reports unavailability without a key', async () => {
    expect(unavailableAi.available).toBe(false);
    await expect(unavailableAi.generateJson(request)).rejects.toThrow('not configured');
  });
});

describe('mailers', () => {
  it('sends through Gmail SMTP with a friendly sender', async () => {
    sendMail.mockResolvedValue({});
    const mailer = new GmailMailer('saanjh@gmail.com', 'app-password');
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'gmail', auth: { user: 'saanjh@gmail.com', pass: 'app-password' } }),
    );
    await mailer.send({ to: 'a@b.c', subject: 'S', html: '<p>h</p>', text: 't' });
    expect(sendMail).toHaveBeenCalledWith({
      from: { name: 'Saanjh', address: 'saanjh@gmail.com' },
      to: 'a@b.c',
      subject: 'S',
      html: '<p>h</p>',
      text: 't',
    });
  });

  it('logs only the subject when SMTP is not configured', async () => {
    const info = vi.fn();
    await new LogMailer({ info, warn: vi.fn(), error: vi.fn() }).send({
      to: 'secret@b.c',
      subject: 'Hello',
      html: 'body',
      text: 'body',
    });
    expect(info).toHaveBeenCalledWith(expect.any(String), { subject: 'Hello' });
    expect(JSON.stringify(info.mock.calls)).not.toContain('secret@b.c');
  });
});

describe('Cloud Scheduler OIDC verifier', () => {
  const verify = schedulerOidcVerifier('https://app/api/internal', 'scheduler@proj.iam.gserviceaccount.com');

  it('rejects a missing or non-bearer header without calling Google', async () => {
    expect(await verify(undefined)).toBe(false);
    expect(await verify('Basic abc')).toBe(false);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('accepts only a verified token for the scheduler account', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'scheduler@proj.iam.gserviceaccount.com', email_verified: true }),
    });
    expect(await verify('Bearer good')).toBe(true);
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'good', audience: 'https://app/api/internal' });

    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'someone@else.com', email_verified: true }),
    });
    expect(await verify('Bearer other')).toBe(false);
    verifyIdToken.mockResolvedValue({ getPayload: () => undefined });
    expect(await verify('Bearer empty')).toBe(false);
  });

  it('rejects garbage tokens', async () => {
    verifyIdToken.mockRejectedValue(new Error('Wrong number of segments'));
    expect(await verify('Bearer garbage')).toBe(false);
  });
});
