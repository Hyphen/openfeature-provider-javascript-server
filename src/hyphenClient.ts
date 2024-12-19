import type { EvaluationResponse, HyphenEvaluationContext, HyphenProviderOptions, TelemetryPayload } from './types';
import { horizon, horizonEndpoints } from './config';
import type { Logger } from '@openfeature/server-sdk';
import { CacheClient } from './cacheClient';

export class HyphenClient {
  private readonly publicKey: string;
  private readonly horizonServerUrls: string[];
  private cache: CacheClient;

  constructor(publicKey: string, options: HyphenProviderOptions) {
    this.publicKey = publicKey;
    this.horizonServerUrls = [...options.horizonServerUrls || [], horizonEndpoints.evaluate];
    this.cache = new CacheClient(options.cache);
  }

  async evaluate(context: HyphenEvaluationContext, logger?: Logger): Promise<EvaluationResponse> {
    const cachedResponse = this.cache.get<EvaluationResponse>(context);
    if (cachedResponse) {
      return cachedResponse;
    }

    const evaluationResponse = await this.fetchEvaluationResponse(this.horizonServerUrls, context, logger);

    if (evaluationResponse) {
      this.cache.set(context, evaluationResponse);
    }
    return evaluationResponse;
  }

  private async fetchEvaluationResponse(
    serverUrls: string[],
    context: HyphenEvaluationContext,
    logger?: Logger,
  ): Promise<EvaluationResponse> {
    let lastError: unknown;

    for (const url of serverUrls) {
      try {
        const response = await this.httpPost(url, context);
        return await response.json();
      } catch (error) {
        lastError = error;
        logger?.debug('Failed to fetch evaluation: ', url, error);
      }
    }
    throw lastError;
  }

  private async httpPost(url: string, payload: unknown) {
    let lastError: unknown;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.publicKey,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return response;
      } else {
        const errorText = await response.text();
        lastError = new Error(errorText);
        console.debug('Failed to fetch', url, errorText);
      }
    } catch (error) {
      lastError = error;
    }

    throw lastError;
  }

  async postTelemetry(payload: TelemetryPayload) {
    await this.httpPost(horizonEndpoints.telemetry, payload);
  }

}
