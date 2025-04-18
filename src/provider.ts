import {
  type BeforeHookContext,
  ErrorCode,
  type EvaluationContext,
  EvaluationDetails,
  FlagValue,
  type Hook,
  type HookContext,
  type JsonValue,
  type Logger,
  OpenFeatureEventEmitter,
  type Paradigm,
  type Provider,
  type ResolutionDetails,
  StandardResolutionReasons,
  ProviderFatalError
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

  private validateOptions(options: HyphenProviderOptions): void {
    if (!options.application) {
      throw new ProviderFatalError('Application is required');
    }
    if (!options.environment) {
      throw new ProviderFatalError('Environment is required');
    }

    this.validateEnvironmentFormat(options.environment);
  }

  constructor(publicKey: string, options: HyphenProviderOptions) {
    this.validateOptions(options);

    this.hyphenClient = new HyphenClient(publicKey, options);
    this.options = options;
    this.runsOn = 'server';
    this.events = new OpenFeatureEventEmitter();

    const hook: Hook = {
      before: this.beforeHook,
      error: this.errorHook,
      after: this.afterHook,
    };

    if (options.enableToggleUsage === false) {
      delete hook.after;
    }

    this.hooks = [hook];
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

  afterHook = async (hookContext: HookContext, evaluationDetails: EvaluationDetails<FlagValue>): Promise<void> => {
    const parsedEvaluationDetails = {
      key: evaluationDetails.flagKey,
      value: evaluationDetails.value,
      type: hookContext.flagValueType,
      reason: evaluationDetails.reason,
    };

    try {
      const { application, environment } = this.options;
      const payload: TelemetryPayload = {
        context: { ...hookContext.context, application, environment } as HyphenEvaluationContext,
        data: { toggle: parsedEvaluationDetails as Evaluation },
      };

      await this.hyphenClient.postTelemetry(payload);
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

  private async getEvaluation<T>(
    flagKey: string,
    context: EvaluationContext,
    expectedType: Evaluation['type'],
    defaultValue: T,
    logger?: Logger,
  ): Promise<{ evaluation: Evaluation; error?: ResolutionDetails<T> }> {
    const evaluations = await this.hyphenClient.evaluate(context as HyphenEvaluationContext, logger);
    const evaluation = evaluations?.toggles?.[flagKey];
    const error = this.getEvaluationParseError(evaluation, expectedType, defaultValue);

    return { evaluation, error };
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger?: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    const { evaluation, error } = await this.getEvaluation(flagKey, context, 'boolean', defaultValue, logger);
    if (error) return error;
    let value: boolean;
    if (typeof evaluation.value === 'string') {
      value = evaluation.value.toLowerCase() === 'true';
    } else {
      value = Boolean(evaluation.value);
    }
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
    logger?: Logger,
  ): Promise<ResolutionDetails<string>> {
    const { evaluation, error } = await this.getEvaluation(flagKey, context, 'string', defaultValue, logger);
    if (error) return error;

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
    logger?: Logger,
  ): Promise<ResolutionDetails<number>> {
    const { evaluation, error } = await this.getEvaluation(flagKey, context, 'number', defaultValue, logger);
    if (error) return error;

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
    logger?: Logger,
  ): Promise<ResolutionDetails<T>> {
    const { evaluation, error } = await this.getEvaluation(flagKey, context, 'object', defaultValue, logger);
    if (error) return error;

    return {
      value: JSON.parse(evaluation.value.toString()),
      variant: evaluation.value.toString(),
      reason: evaluation.reason,
    };
  }

  private validateEnvironmentFormat(environment: string): void {
    // Check if it's a project environment ID (starts with 'pevr_')
    const isEnvironmentId = environment.startsWith('pevr_');

    // Check if it's a valid alternateId (1-25 chars, lowercase letters, numbers, hyphens, underscores)
    const isValidAlternateId = /^(?!.*\b(environments)\b)[a-z0-9\-_]{1,25}$/.test(environment);

    if (!isEnvironmentId && !isValidAlternateId) {
      throw new Error(
        'Invalid environment format. Must be either a project environment ID (starting with "pevr_") ' +
          'or a valid alternateId (1-25 characters, lowercase letters, numbers, hyphens, and underscores).',
      );
    }
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
