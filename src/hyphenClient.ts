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
    this.horizonServerUrls = [...(options.horizonServerUrls || []), horizon.url];
    this.cache = new CacheClient(options.cache);
  }

  private async tryUrls(urlPath: string, payload: unknown, logger?: Logger): Promise<Response> {
    let lastError: unknown;

    for (const baseUrl of this.horizonServerUrls) {
      try {
        const url = `${baseUrl}${urlPath}`;
        const response = await this.httpPost(url, payload);
        return response;
      } catch (error) {
        lastError = error;
        logger?.debug('Failed to fetch: ', baseUrl, error);
      }
    }
    throw lastError;
  }

  async evaluate(context: HyphenEvaluationContext, logger?: Logger): Promise<EvaluationResponse> {
    const cachedResponse = this.cache.get<EvaluationResponse>(context);
    if (cachedResponse) {
      return cachedResponse;
    }

    const response = await this.tryUrls('/toggle/evaluate', context, logger);
    const evaluationResponse = await response.json();

    if (evaluationResponse) {
      this.cache.set(context, evaluationResponse);
    }
    return evaluationResponse;
  }

  async postTelemetry(payload: TelemetryPayload, logger?: Logger) {
    await this.tryUrls('/toggle/telemetry', payload, logger);
  }

  private async httpPost(url: string, payload: unknown) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.publicKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return response;
  }
}
