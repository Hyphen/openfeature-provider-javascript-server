import NodeCache from '@cacheable/node-cache';
import { GenerateCacheKeyFn, HyphenEvaluationContext, HyphenProviderOptions } from './types';
import { cache } from './config';

export class CacheClient {
  private readonly cache: NodeCache;
  private readonly generateCacheKeyFn: GenerateCacheKeyFn;

  constructor(cacheConfig?: HyphenProviderOptions['cache']) {
    const ttlSeconds = cacheConfig?.ttlSeconds ?? cache.ttlSeconds;

    this.cache = new NodeCache({
      stdTTL: ttlSeconds,
      checkperiod: ttlSeconds * 2,
    });

    this.generateCacheKeyFn = cacheConfig?.generateCacheKey ?? this.defaultGenerateCacheKey;
  }

  private defaultGenerateCacheKey(context: HyphenEvaluationContext): string {
    return JSON.stringify(context);
  }

  generateCacheKey(context: HyphenEvaluationContext): string {
    return this.generateCacheKeyFn(context);
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set<T>(key: string, value: T) {
    this.cache.set(key, value);
  }
}
