import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyphenClient } from '../src/hyphenClient';
import NodeCache from '@cacheable/node-cache';
import { horizon, cache } from '../src/config';
import type { HyphenEvaluationContext } from '../src';

vi.mock('@cacheable/node-cache');
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

  beforeEach(() => {
    vi.clearAllMocks();
    horizon.url = mockHorizonUrl;
    cache.ttlSeconds = 600;
  });

  it('should initialize with the correct configurations', () => {
    const client = new HyphenClient(publicKey);

    expect(client).toBeDefined();
    expect(NodeCache).toHaveBeenCalledWith({
      stdTTL: cache.ttlSeconds,
      checkperiod: cache.ttlSeconds * 2,
    });
  });

  it('should return cached response if available', async () => {
    const mockCache = new NodeCache();
    vi.mocked(NodeCache).mockReturnValue(mockCache);
    mockCache.get = vi.fn().mockReturnValue(mockResponse);

    const client = new HyphenClient(publicKey);
    const result = await client.evaluate(mockContext);

    expect(mockCache.get).toHaveBeenCalledWith(mockContext.targetingKey);
    expect(result).toEqual(mockResponse);
  });

  it('should fetch and cache the response if not cached', async () => {
    const mockCache = new NodeCache();
    vi.mocked(NodeCache).mockReturnValue(mockCache);
    mockCache.get = vi.fn().mockReturnValue(null);
    mockCache.set = vi.fn();

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as Response);

    const client = new HyphenClient(publicKey);
    const result = await client.evaluate(mockContext);

    expect(mockCache.get).toHaveBeenCalledWith(mockContext.targetingKey);
    expect(fetch).toHaveBeenCalledWith(mockHorizonUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': publicKey,
      },
      body: JSON.stringify(mockContext),
    });
    expect(mockCache.set).toHaveBeenCalledWith(mockContext.targetingKey, mockResponse);
    expect(result).toEqual(mockResponse);
  });

  it('should throw an error if all server requests fail', async () => {
    const mockCache = new NodeCache();
    vi.mocked(NodeCache).mockReturnValue(mockCache);
    mockCache.get = vi.fn().mockReturnValue(null);

    vi.mocked(fetch).mockRejectedValue(mockError);

    const client = new HyphenClient(publicKey);

    await expect(client.evaluate(mockContext)).rejects.toThrowError(mockError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should use multiple server URLs in case of failure', async () => {
    const mockCache = new NodeCache();
    vi.mocked(NodeCache).mockReturnValue(mockCache);
    mockCache.get = vi.fn().mockReturnValue(null);

    const alternateUrl = 'https://alternate-url.com';
    vi.mocked(fetch)
      .mockRejectedValueOnce(mockError) // First URL fails
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as Response); // Second URL succeeds

    const client = new HyphenClient(publicKey, [alternateUrl]);
    const result = await client.evaluate(mockContext);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(alternateUrl, expect.any(Object));
    expect(fetch).toHaveBeenCalledWith(mockHorizonUrl, expect.any(Object));
    expect(result).toEqual(mockResponse);
  });

  it('should add horizon URL if not present in the server URLs', () => {
    const customUrl = 'https://custom-url.com';
    const client = new HyphenClient(publicKey, [customUrl]);

    expect(client['horizonServerUrls']).toEqual([customUrl, mockHorizonUrl]);
  });

  it('should handle non-successful responses and set the lastError', async () => {
    const mockCache = new NodeCache();
    vi.mocked(NodeCache).mockReturnValue(mockCache);
    mockCache.get = vi.fn().mockReturnValue(null);

    const errorText = 'Error: Unauthorized';
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      text: vi.fn().mockResolvedValue(errorText),
    } as unknown as Response);

    const client = new HyphenClient(publicKey);

    await expect(client.evaluate(mockContext)).rejects.toThrowError(errorText);

    expect(fetch).toHaveBeenCalledWith(mockHorizonUrl, expect.any(Object));
  });
});
