import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import NodeCache from '@cacheable/node-cache';
import { CacheClient } from '../src/cacheClient';
import type { HyphenEvaluationContext, HyphenProviderOptions } from '../src/types';

vi.mock('@cacheable/node-cache');

describe('CacheClient', () => {
  let cacheClient: CacheClient;
  let mockNodeCache: {
    get: Mock;
    set: Mock;
  };
  let options: HyphenProviderOptions['cache'];

  beforeEach(() => {
    vi.clearAllMocks();
    options = { ttlSeconds: 600 };
    mockNodeCache = {
      get: vi.fn(),
      set: vi.fn(),
    };

    vi.mocked(NodeCache).mockImplementation(() => mockNodeCache as any);
    cacheClient = new CacheClient(options);
  });

  it('should initialize with the given ttlSeconds', () => {
    expect(NodeCache).toHaveBeenCalledWith({
      stdTTL: options!.ttlSeconds!,
      checkperiod: options!.ttlSeconds! * 2,
    });
  });

  it('should set a value in the cache', () => {
    const key = 'test-key';
    const value = { data: 'test-value' };

    cacheClient.set(key, value);
    expect(mockNodeCache.set).toHaveBeenCalledWith(key, value);
  });

  it('should get a value from the cache', () => {
    const key = 'test-key';
    const value = { data: 'test-value' };

    mockNodeCache.get.mockReturnValue(value);

    const result = cacheClient.get(key);
    expect(mockNodeCache.get).toHaveBeenCalledWith(key);
    expect(result).toEqual(value);
  });

  it('should return undefined if the key is not found', () => {
    const key = 'unknown-key';
    mockNodeCache.get.mockReturnValue(undefined);

    const result = cacheClient.get(key);
    expect(mockNodeCache.get).toHaveBeenCalledWith(key);
    expect(result).toBeUndefined();
  });

  it('should generate a cache key based on the targetingKey in the context', () => {
    const context: HyphenEvaluationContext = {
      targetingKey: 'user-123',
      application: 'test-app',
      environment: 'test-env',
      customAttributes: {},
      ipAddress: 'x.x.x.x',
      user: {
        customAttributes: {},
        email: 'john@doe.com',
        id: 'user-123',
        name: 'John Doe',
      },
    };

    const cacheKey = cacheClient.generateCacheKey(context);
    expect(cacheKey).toBe(JSON.stringify(context));
  });
});
