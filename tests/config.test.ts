import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('cache', () => {
    it('should use default TTL when CACHE_TTL_SECONDS is not set', async () => {
      delete process.env.CACHE_TTL_SECONDS;
      const { cache } = await import('../src/config');
      expect(cache.ttlSeconds).toBe(30);
    });

    it('should use environment TTL when CACHE_TTL_SECONDS is set', async () => {
      process.env.CACHE_TTL_SECONDS = '60';
      const { cache } = await import('../src/config');
      expect(cache.ttlSeconds).toBe(60);
    });
  });
});
