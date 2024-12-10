import type { EvaluationResponse, HyphenEvaluationContext, HyphenProviderOptions } from './types';
import { horizon } from './config';
import type { Logger } from '@openfeature/server-sdk';
import { CacheClient } from './cacheClient';

export class HyphenClient {
  private readonly publicKey: string;
  private readonly horizonServerUrls: string[];
  private cache: CacheClient;

  constructor(publicKey: string, options: HyphenProviderOptions) {
    this.publicKey = publicKey;

    const horizonServerUrls = options.horizonServerUrls || [];
    horizonServerUrls.push(horizon.url);
    this.horizonServerUrls = horizonServerUrls;

    this.cache = new CacheClient(options.cache);
  }

  async evaluate(context: HyphenEvaluationContext, logger?: Logger): Promise<EvaluationResponse> {
    const cacheKey = this.cache.generateCacheKey(context);
    const cachedResponse = this.cache.get<EvaluationResponse>(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const evaluationResponse = await this.fetchEvaluationResponse(this.horizonServerUrls, context, logger);

    if (evaluationResponse) {
      this.cache.set(cacheKey, evaluationResponse);
    }
    return evaluationResponse;
  }

  private async fetchEvaluationResponse(
    serverUrls: string[],
    context: HyphenEvaluationContext,
    logger?: Logger,
  ): Promise<EvaluationResponse> {
    let lastError: unknown;
    let evaluationResponse;

    for (const url of serverUrls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.publicKey,
          },
          body: JSON.stringify(context),
        });

        if (response.ok) {
          evaluationResponse = <EvaluationResponse>await response.json();
          break;
        } else {
          const errorText = await response.text();
          lastError = new Error(errorText);
          logger?.debug('Failed to fetch evaluation: ', url, errorText)
        }
      } catch (error) {
        lastError = error;
      }
    }

    if(evaluationResponse) {
      return evaluationResponse;
    }

    throw lastError;
  }
}
