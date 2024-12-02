import type { EvaluationResponse, HyphenEvaluationContext } from './types';
import NodeCache from '@cacheable/node-cache';
import { horizon, cache } from './config';
import type { Logger } from '@openfeature/server-sdk';

export class HyphenClient {
  private readonly publicKey: string;
  private readonly horizonServerUrls: string[];
  private cache: NodeCache;

  constructor(publicKey: string, horizonServerUrls: string[] = []) {
    this.publicKey = publicKey;
    horizonServerUrls.push(horizon.url);
    this.horizonServerUrls = horizonServerUrls;
    this.cache = new NodeCache({
      stdTTL: cache.ttlSeconds,
      checkperiod: cache.ttlSeconds * 2,
    });
  }

  async evaluate(context: HyphenEvaluationContext, logger?: Logger): Promise<EvaluationResponse> {
    const cachedResponse = this.cache.get<EvaluationResponse>(context.targetingKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const evaluationResponse = await this.fetchEvaluationResponse(this.horizonServerUrls, context, logger);

    if (evaluationResponse) {
      this.cache.set(context.targetingKey, evaluationResponse);
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
