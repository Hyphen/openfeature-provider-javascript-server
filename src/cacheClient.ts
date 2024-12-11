import NodeCache from '@cacheable/node-cache';
import { GenerateCacheKeyFn, HyphenEvaluationContext, HyphenProviderOptions } from './types';
import { cache } from './config';
import hash from 'object-hash';

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
    return hash(context);
  }

  private generateCacheKey(context: HyphenEvaluationContext): string {
    return this.generateCacheKeyFn(context);
  }

  get<T>(context: HyphenEvaluationContext): T | undefined {
    const key = this.generateCacheKey(context);
    return this.cache.get<T>(key);
  }

  set<T>(context: HyphenEvaluationContext, value: T) {
    const key = this.generateCacheKey(context);
    this.cache.set(key, value);
  }
}
