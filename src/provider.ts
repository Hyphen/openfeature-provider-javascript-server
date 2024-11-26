import {
  type BeforeHookContext,
  ErrorCode,
  type EvaluationContext,
  type Hook,
  type HookContext,
  type JsonValue,
  OpenFeatureEventEmitter,
  type Paradigm,
  type Provider,
  type ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';

import pkg from '../package.json';
import NodeCache from '@cacheable/node-cache';
import { EvaluationResponse, HyphenEvaluationContext, HyphenProviderOptions } from '@/types';
import { HORIZON_URL } from '@/config';

export class HyphenProvider implements Provider {
  private readonly publicKey: string;
  private readonly options: HyphenProviderOptions;
  private cache: NodeCache;
  public events: OpenFeatureEventEmitter;
  public runsOn?: Paradigm;
  public hooks: Hook[];
  public metadata = {
    name: 'hyphen-toggle-node',
    version: pkg.version,
  };

  constructor(publicKey: string, options: HyphenProviderOptions) {
    this.publicKey = publicKey;
    this.options = options;
    this.runsOn = 'server';
    this.events = new OpenFeatureEventEmitter();
    this.hooks = [
      {
        before: this.beforeHook,
        error: this.errorHook,
        finally: this.finallyHook,
      },
    ];

    this.cache = new NodeCache({
      stdTTL: 30,
      checkperiod: 60,
    });
  }

  private getTargetingKey(hyphenEvaluationContext: HyphenEvaluationContext): string {
    if (hyphenEvaluationContext.targetingKey) {
      return hyphenEvaluationContext.targetingKey;
    }
    if (hyphenEvaluationContext.user) {
      return hyphenEvaluationContext.user.id;
    }
    // TODO: what is a better way to do this? Should we also have a service property so we don't add the random value?
    return `${this.options.application}-${this.options.environment}-${Math.random().toString(36).substring(7)}`;
  }

  beforeHook = async (
    hookContext: BeforeHookContext,
    // hints: HookHints
  ): Promise<EvaluationContext> => {
    hookContext.context.application = this.options.application;
    hookContext.context.environment = this.options.environment;
    hookContext.context.targetingKey = this.getTargetingKey(hookContext.context as HyphenEvaluationContext);
    this.validateContext(hookContext.context);
    return hookContext.context;
  };

  errorHook = async (
    hookContext: HookContext,
    error: unknown,
    // hints: HookHints
  ): Promise<void> => {
    if (error instanceof Error) {
      hookContext.logger.error('Error', error.message);
    } else {
      hookContext.logger.error('Error', error);
    }
  };

  finallyHook = async (
    hookContext: HookContext,
    // hints: HookHints
  ): Promise<void> => {
    // This is a good place to log client usage. This will be post MVP
    hookContext.logger.info('logging usage');
  };

  wrongType<T>(value: T): ResolutionDetails<T> {
    return {
      value,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.TYPE_MISMATCH,
    };
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    // logger: Logger
  ): Promise<ResolutionDetails<boolean>> {
    const evaluations = await this.evaluate(context as HyphenEvaluationContext);
    const evaluation = evaluations?.toggles[flagKey];

    if (evaluation.errorMessage) {
      return {
        value: defaultValue,
        errorMessage: evaluation.errorMessage,
        errorCode: ErrorCode.GENERAL,
      };
    }

    if (evaluation?.type !== 'boolean') {
      return this.wrongType(defaultValue);
    }

    const value = Boolean(evaluation.value);

    return {
      value,
      variant: evaluation.value.toString(),
      reason: evaluation.reason,
    };
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    // logger: Logger
  ): Promise<ResolutionDetails<string>> {
    const evaluations = await this.evaluate(context as HyphenEvaluationContext);
    const evaluation = evaluations?.toggles[flagKey];

    if (evaluation.errorMessage) {
      return {
        value: defaultValue,
        errorMessage: evaluation.errorMessage,
        errorCode: ErrorCode.GENERAL,
      };
    }

    if (evaluation?.type !== 'string') {
      return this.wrongType(defaultValue);
    }

    return {
      value: evaluation.value.toString(),
      variant: evaluation.value.toString(),
      reason: evaluation.reason,
    };
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    // logger: Logger
  ): Promise<ResolutionDetails<number>> {
    const evaluations = await this.evaluate(context as HyphenEvaluationContext);
    const evaluation = evaluations?.toggles[flagKey];

    if (evaluation.errorMessage) {
      return {
        value: defaultValue,
        errorMessage: evaluation.errorMessage,
        errorCode: ErrorCode.GENERAL,
      };
    }

    if (evaluation?.type !== 'number') {
      return this.wrongType(defaultValue);
    }

    return {
      value: Number(evaluation.value),
      variant: evaluation.value.toString(),
      reason: evaluation.reason,
    };
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    // logger: Logger
  ): Promise<ResolutionDetails<T>> {
    const evaluations = await this.evaluate(context as HyphenEvaluationContext);
    const evaluation = evaluations?.toggles[flagKey];

    if (evaluation.errorMessage) {
      return {
        value: defaultValue,
        errorMessage: evaluation.errorMessage,
        errorCode: ErrorCode.GENERAL,
      };
    }

    if (evaluation?.type !== 'object') {
      return this.wrongType(defaultValue);
    }

    return {
      value: JSON.parse(evaluation.value.toString()),
      variant: evaluation.value.toString(),
      reason: evaluation.reason,
    };
  }

  private async evaluate(context: HyphenEvaluationContext) {
    const cacheResult = this.cache.get(context.targetingKey);
    if (cacheResult) {
      return cacheResult as EvaluationResponse;
    }

    const serverUrls = this.options.horizonServerUrls ?? [];
    serverUrls.push(HORIZON_URL);

    let lastError: unknown;

    for (const url of serverUrls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': `${this.publicKey}`,
          },
          body: JSON.stringify(context),
        });

        if (response.ok) {
          const data = (await response.json()) as EvaluationResponse;
          this.cache.set(context.targetingKey, data);
          return data;
        } else {
          lastError = new Error(`Error: ${await response.text()}`);
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('Unknown error occurred while evaluating context');
  }

  private validateContext(context: EvaluationContext): HyphenEvaluationContext {
    if (!context) {
      throw new Error('Evaluation context is required');
    }
    if (!context.targetingKey) {
      throw new Error('targetingKey is required');
    }
    if (!context.application) {
      throw new Error('application is required');
    }
    if (!context.environment) {
      throw new Error('environment is required');
    }
    return context as HyphenEvaluationContext;
  }
}
