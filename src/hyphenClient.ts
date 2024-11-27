import type { EvaluationResponse, HyphenEvaluationContext } from './types';
import NodeCache from '@cacheable/node-cache';
import { horizon, cache } from './config';

export class HyphenClient {
  private readonly publicKey: string;
  private readonly horizonServerUrls: string[];
  private cache: NodeCache;

  constructor(publicKey: string, horizonServerUrls?: string[]) {
    this.publicKey = publicKey;
    this.horizonServerUrls = this.getServerUrls(horizonServerUrls);
    this.cache = new NodeCache({
      stdTTL: cache.ttl,
      checkperiod: cache.ttl * 2,
    });
  }

  async evaluate(context: HyphenEvaluationContext): Promise<EvaluationResponse> {
    const cachedResponse = this.cache.get<EvaluationResponse>(context.targetingKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const evaluationResponse = await this.fetchEvaluationResponse(this.horizonServerUrls, context);

    if (evaluationResponse) {
      this.cache.set(context.targetingKey, evaluationResponse);
    }
    return evaluationResponse;
  }

  private getServerUrls(horizonServerUrls: string[] = []) {
    if (!horizonServerUrls.includes(horizon.url)) {
      horizonServerUrls.push(horizon.url);
    }
    return horizonServerUrls;
  }

  private async fetchEvaluationResponse(
    serverUrls: string[],
    context: HyphenEvaluationContext
  ): Promise<EvaluationResponse> {
    let lastError: unknown;

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
          return <EvaluationResponse>await response.json();
        } else {
          const errorText = await response.text();
          lastError = new Error(errorText);
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('Failed to fetch evaluation response from all servers.');
  }
}
