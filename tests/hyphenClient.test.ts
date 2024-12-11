import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { HyphenClient } from '../src/hyphenClient';
import { horizon } from '../src/config';
import type { HyphenEvaluationContext, HyphenProviderOptions } from '../src/types';
import { CacheClient } from '../src/cacheClient';

vi.mock('../src/cacheClient');
vi.stubGlobal('fetch', vi.fn());

describe('HyphenClient', () => {
  const publicKey = 'test-public-key';
  const mockHorizonUrl = 'https://mock-horizon-url.com';
  const mockContext: HyphenEvaluationContext = {
    targetingKey: 'test-key',
    ipAddress: '127.0.0.1',
    application: 'test-app',
    environment: 'test-env',
    customAttributes: { role: 'admin' },
    user: {
      id: 'user-id',
      email: 'user@example.com',
      name: 'Test User',
      customAttributes: { subscription: 'premium' },
    },
  };
  const mockResponse = {
    evaluations: [
      {
        key: 'feature-flag',
        value: true,
        type: 'boolean',
        reason: 'evaluation succeeded',
        errorMessage: '',
      },
    ],
  };
  const mockError = new Error('Failed to fetch');

  let options: HyphenProviderOptions;
  let mockCacheClient: {
    get: Mock;
    set: Mock;
    generateCacheKey: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    horizon.url = mockHorizonUrl;
    options = {
      horizonServerUrls: [],
      application: 'test-app',
      environment: 'test-env',
      cache: { ttlSeconds: 600 },
    };

    mockCacheClient = {
      get: vi.fn(),
      set: vi.fn(),
      generateCacheKey: vi.fn((ctx: HyphenEvaluationContext) => ctx.targetingKey),
    };

    vi.mocked(CacheClient).mockImplementation(() => mockCacheClient as any);
  });

  it('should initialize with the correct configurations', () => {
    const client = new HyphenClient(publicKey, options);
    expect(client).toBeDefined();
    expect(CacheClient).toHaveBeenCalledWith(options.cache);
  });

  it('should return cached response if available', async () => {
    mockCacheClient.get.mockReturnValue(mockResponse);

    const client = new HyphenClient(publicKey, options);
    const result = await client.evaluate(mockContext);

    expect(mockCacheClient.get).toHaveBeenCalledWith(mockContext.targetingKey);
    expect(result).toEqual(mockResponse);
  });

  it('should fetch and cache the response if not cached', async () => {
    mockCacheClient.get.mockReturnValue(null);

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as Response);

    const client = new HyphenClient(publicKey, options);
    const result = await client.evaluate(mockContext);

    expect(mockCacheClient.get).toHaveBeenCalledWith(mockContext.targetingKey);
    expect(fetch).toHaveBeenCalledWith(mockHorizonUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': publicKey,
      },
      body: JSON.stringify(mockContext),
    });
    expect(mockCacheClient.set).toHaveBeenCalledWith(mockContext.targetingKey, mockResponse);
    expect(result).toEqual(mockResponse);
  });

  it('should throw an error if all server requests fail', async () => {
    mockCacheClient.get.mockReturnValue(null);
    vi.mocked(fetch).mockRejectedValue(mockError);

    const client = new HyphenClient(publicKey, options);
    await expect(client.evaluate(mockContext)).rejects.toThrowError(mockError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should use multiple server URLs in case of failure', async () => {
    mockCacheClient.get.mockReturnValue(null);

    const alternateUrl = 'https://alternate-url.com';
    options.horizonServerUrls = [alternateUrl];

    vi.mocked(fetch)
      .mockRejectedValueOnce(mockError) // First URL fails
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response); // Second URL succeeds

    const client = new HyphenClient(publicKey, options);
    const result = await client.evaluate(mockContext);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(alternateUrl, expect.any(Object));
    expect(fetch).toHaveBeenCalledWith(mockHorizonUrl, expect.any(Object));
    expect(result).toEqual(mockResponse);
  });

  it('should add horizon URL if not present in the server URLs', () => {
    const client = new HyphenClient(publicKey, options);
    expect(client['horizonServerUrls']).toEqual([mockHorizonUrl]);
  });

  it('should handle non-successful responses and set the lastError', async () => {
    mockCacheClient.get.mockReturnValue(null);

    const errorText = 'Error: Unauthorized';
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      text: vi.fn().mockResolvedValue(errorText),
    } as unknown as Response);

    const client = new HyphenClient(publicKey, options);
    await expect(client.evaluate(mockContext)).rejects.toThrowError(errorText);

    expect(fetch).toHaveBeenCalledWith(mockHorizonUrl, expect.any(Object));
  });
});
