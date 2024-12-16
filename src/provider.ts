import {
  type BeforeHookContext,
  ErrorCode,
  type EvaluationContext, EvaluationDetails, FlagValue,
  type Hook,
  type HookContext,
  type JsonValue, type Logger,
  OpenFeatureEventEmitter,
  type Paradigm,
  type Provider,
  type ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';

import { Evaluation, HyphenEvaluationContext, HyphenProviderOptions, TelemetryPayload } from './types';
import pkg from '../package.json';
import { HyphenClient } from './hyphenClient';

export class HyphenProvider implements Provider {
  public readonly options: HyphenProviderOptions;
  private readonly hyphenClient: HyphenClient;
  public events: OpenFeatureEventEmitter;
  public runsOn?: Paradigm;
  public hooks: Hook[];
  public metadata = {
    name: 'hyphen-toggle-node',
    version: pkg.version,
  };

  constructor(publicKey: string, options: HyphenProviderOptions) {
    if(!options.application) {
      throw new Error('Application is required');
    }
    if(!options.environment) {
      throw new Error('Environment is required');
    }

    this.hyphenClient = new HyphenClient(publicKey, options.horizonServerUrls);
    this.options = options;
    this.runsOn = 'server';
    this.events = new OpenFeatureEventEmitter();
    this.hooks = [
      {
        before: this.beforeHook,
        error: this.errorHook,
        finally: this.finallyHook,
        after: this.afterHook,
      },
    ];
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

  afterHook = async (hookContext: HookContext, evaluationDetails: EvaluationDetails<FlagValue>): Promise<void> => {
    const parsedEvaluationDetails = {
      key: evaluationDetails.flagKey,
      value: evaluationDetails.value,
      type: hookContext.flagValueType,
      reason: evaluationDetails.reason,
    };

    try {
      const payload: TelemetryPayload = {
        context: hookContext.context as HyphenEvaluationContext,
        data: { toggle: parsedEvaluationDetails as Evaluation},
      };

      await this.hyphenClient.postTelemetry(payload);
      hookContext.logger.info('Payload sent to postTelemetry:', JSON.stringify(payload));
    } catch (error) {
      hookContext.logger.error('Unable to log usage.', error);
      throw error;
    }
  };

  wrongType<T>(value: T): ResolutionDetails<T> {
    return {
      value,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.TYPE_MISMATCH,
    };
  }

  private getEvaluationParseError<T>(
    evaluation: Evaluation,
    expectedType: Evaluation['type'],
    defaultValue: T,
  ): ResolutionDetails<T> | undefined {
    if (!evaluation || evaluation.errorMessage) {
      throw new Error(evaluation?.errorMessage ?? 'Evaluation does not exist');
    }

    if (evaluation.type !== expectedType) {
      return this.wrongType(defaultValue);
    }
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger?: Logger
  ): Promise<ResolutionDetails<boolean>> {
    const evaluations = await this.hyphenClient.evaluate(context as HyphenEvaluationContext, logger);
    const evaluation = evaluations?.toggles?.[flagKey];

    const evaluationError = this.getEvaluationParseError(evaluation, 'boolean', defaultValue);

    if (evaluationError) return evaluationError;

    const value = Boolean(evaluation.value);

    return {
      value,
      variant: evaluation.value?.toString(),
      reason: evaluation.reason,
    };
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    logger?: Logger
  ): Promise<ResolutionDetails<string>> {
    const evaluations = await this.hyphenClient.evaluate(context as HyphenEvaluationContext);
    const evaluation = evaluations?.toggles?.[flagKey];

    const evaluationError = this.getEvaluationParseError(evaluation, 'string', defaultValue);
    if (evaluationError) return evaluationError;

    return {
      value: evaluation.value?.toString(),
      variant: evaluation.value?.toString(),
      reason: evaluation.reason,
    };
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    logger?: Logger
  ): Promise<ResolutionDetails<number>> {
    const evaluations = await this.hyphenClient.evaluate(context as HyphenEvaluationContext);
    const evaluation = evaluations?.toggles?.[flagKey];

    const evaluationError = this.getEvaluationParseError(evaluation, 'number', defaultValue);
    if (evaluationError) return evaluationError;

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
    logger?: Logger
  ): Promise<ResolutionDetails<T>> {
    const evaluations = await this.hyphenClient.evaluate(context as HyphenEvaluationContext);
    const evaluation = evaluations?.toggles?.[flagKey];

    const evaluationError = this.getEvaluationParseError<T>(evaluation, 'object', defaultValue);
    if (evaluationError) return evaluationError;

    return {
      value: JSON.parse(evaluation.value.toString()),
      variant: evaluation.value.toString(),
      reason: evaluation.reason,
    };
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
