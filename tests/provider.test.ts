import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyphenProvider } from '../src';
import type { HookContext } from '@openfeature/server-sdk';
import { HyphenClient } from '../src/hyphenClient';
import type { Evaluation, EvaluationResponse } from '../src';

vi.mock('../src/config', () => ({
  cache: {
    ttlSeconds: 30,
  },
}));

const createMockEvaluation = (
  key: string,
  value: boolean | string | number | Record<string, any>,
  type: 'boolean' | 'string' | 'number' | 'object',
  reason: string = 'EVALUATED',
  errorMessage: string = '',
): Evaluation => ({
  key,
  value,
  type,
  reason,
  errorMessage,
});

describe('HyphenProvider', () => {
  const publicKey = 'test-public-key';
  const options = {
    horizonUrls: ['https://test-server.com'],
    application: 'test-app',
    environment: 'test-env',
  };
  const mockContext: any = {
    targetingKey: 'test-key',
    application: 'test-app',
    environment: 'test-env',
  };

  let provider: HyphenProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new HyphenProvider(publicKey, options);
  });

  describe('constructor', () => {
    it('should throw an error if application or environment is missing', () => {
      expect(() => new HyphenProvider(publicKey, { ...options, application: '' })).toThrowError(
        'Application is required',
      );
      expect(() => new HyphenProvider(publicKey, { ...options, environment: '' })).toThrowError(
        'Environment is required',
      );
    });

    it('should accept valid environment formats', () => {
      // With alternateId format
      expect(() => new HyphenProvider(publicKey, { 
        ...options, 
        environment: 'production' 
      })).not.toThrow();

      // With project environment ID format
      expect(() => new HyphenProvider(publicKey, { 
        ...options, 
        environment: 'env_abc123' 
      })).not.toThrow();
    });

    it('should throw an error if environment has invalid format', () => {
      expect(() => new HyphenProvider(publicKey, { 
        ...options, 
        environment: 'INVALID_UPPERCASE' 
      })).toThrowError('Invalid environment format');

      expect(() => new HyphenProvider(publicKey, { 
        ...options, 
        environment: 'a'.repeat(26) 
      })).toThrowError('Invalid environment format');

      expect(() => new HyphenProvider(publicKey, { 
        ...options, 
        environment: 'invalid@character' 
      })).toThrowError('Invalid environment format');

      expect(() => new HyphenProvider(publicKey, { 
        ...options, 
        environment: 'environments' 
      })).toThrowError('Invalid environment format');
    });

    it('should delete the after hook if enableToggleUsage is false', () => {
      const optionsWithToggleDisabled = {
        ...options,
        enableToggleUsage: false,
      };

      const providerWithToggleDisabled = new HyphenProvider(publicKey, optionsWithToggleDisabled);

      expect(providerWithToggleDisabled.hooks.some((hook) => hook.after)).toBe(false);
    });
  });

  describe('getTargetingKey', () => {
    it('should return targetingKey if present', () => {
      const key = provider['getTargetingKey']({ targetingKey: 'test-key' } as any);
      expect(key).toBe('test-key');
    });

    it('should return user ID if targetingKey is not present', () => {
      const key = provider['getTargetingKey']({
        user: { id: 'user-id' },
      } as any);
      expect(key).toBe('user-id');
    });

    it('should return a random key if neither targetingKey nor user ID is present', () => {
      const key = provider['getTargetingKey']({} as any);
      const isValidKey = new RegExp(`^${options.application}-${options.environment}-[a-z0-9]+$`);
      expect(isValidKey.test(key)).toBe(true);
    });
  });

  describe('Hooks', () => {
    describe('beforeHook', () => {
      it('should execute beforeHook and modify the context', async () => {
        const mockContext: any = {
          context: {
            targetingKey: 'test-key',
            application: 'test-app',
            environment: 'test-env',
          },
        };

        const result = await provider.beforeHook(mockContext);

        expect(result.application).toBe(options.application);
        expect(result.environment).toBe(options.environment);
        expect(result.targetingKey).toBeDefined();
      });
    });

    describe('afterHook', () => {
      it('should log errors in errorHook', async () => {
        const mockLogger = { error: vi.fn() };
        const hookContext: HookContext = { logger: mockLogger } as any;

        await provider.errorHook(hookContext, new Error('Test error'));

        expect(mockLogger.error).toHaveBeenCalledWith('Error', 'Test error');
      });

      it('should log the error as-is if it is not an instance of Error', async () => {
        const mockLogger = { error: vi.fn() };
        const hookContext: HookContext = { logger: mockLogger } as any;

        const nonErrorValue = 'string error';

        await provider.errorHook(hookContext, nonErrorValue);

        expect(mockLogger.error).toHaveBeenCalledWith('Error', nonErrorValue);
      });
    });

    describe('afterHook', () => {
      it('should post telemetry data successfully', async () => {
        const mockLogger = { info: vi.fn(), error: vi.fn() };
        const mockEvaluationDetails = {
          flagKey: 'test-flag',
          value: true,
          reason: 'EVALUATED',
        };
        const hookContext = {
          logger: mockLogger,
          flagValueType: 'boolean',
          context: mockContext,
        };

        const mockPostTelemetry = vi.spyOn(HyphenClient.prototype, 'postTelemetry').mockResolvedValue(undefined);

        await provider.afterHook(hookContext as any, mockEvaluationDetails as any);

        expect(mockPostTelemetry).toHaveBeenCalledWith({
          context: mockContext,
          data: {
            toggle: {
              key: 'test-flag',
              value: true,
              type: 'boolean',
              reason: 'EVALUATED',
            },
          },
        });
      });

      it('should handle and rethrow telemetry errors', async () => {
        const mockLogger = { info: vi.fn(), error: vi.fn() };
        const mockEvaluationDetails = {
          flagKey: 'test-flag',
          value: true,
          reason: 'EVALUATED',
        };
        const hookContext = {
          logger: mockLogger,
          flagValueType: 'boolean',
          context: mockContext,
        };

        const telemetryError = new Error('Failed to post telemetry');
        const mockPostTelemetry = vi
          .spyOn(HyphenClient.prototype, 'postTelemetry')
          .mockRejectedValue(telemetryError);

        await expect(provider.afterHook(hookContext as any, mockEvaluationDetails as any)).rejects.toThrow(
          telemetryError,
        );

        expect(mockPostTelemetry).toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith('Unable to log usage.', telemetryError);
      });
    });
  });

  describe('resolveBooleanEvaluation', () => {
    it('should return a boolean evaluation', async () => {
      const mockEvaluationResponse: EvaluationResponse = {
        toggles: {
          'flag-key': createMockEvaluation('flag-key', true, 'boolean'),
        },
      };

      const mockEvaluate = vi.spyOn(HyphenClient.prototype, 'evaluate').mockResolvedValue(mockEvaluationResponse);

      const result = await provider.resolveBooleanEvaluation('flag-key', false, mockContext);

      expect(mockEvaluate).toHaveBeenCalled();
      expect(result).toEqual({
        value: true,
        variant: 'true',
        reason: 'EVALUATED',
      });
    });

    it('should return an error if the evaluation fails', async () => {
      const mockEvaluationResponse: EvaluationResponse = {
        toggles: {
          'flag-key': createMockEvaluation('flag-key', '', 'boolean', 'ERROR', 'Evaluation failed'),
        },
      };

      const mockEvaluate = vi.spyOn(HyphenClient.prototype, 'evaluate').mockResolvedValue(mockEvaluationResponse);
      await expect(provider.resolveBooleanEvaluation('flag-key', false, mockContext)).rejects.toThrow(
        'Evaluation failed',
      );
      expect(mockEvaluate).toHaveBeenCalled();
    });
  });

  describe('resolveStringEvaluation', () => {
    it('should return a string evaluation', async () => {
      const mockEvaluationResponse: EvaluationResponse = {
        toggles: {
          'flag-key': createMockEvaluation('flag-key', 'test-value', 'string'),
        },
      };

      const mockEvaluate = vi.spyOn(HyphenClient.prototype, 'evaluate').mockResolvedValue(mockEvaluationResponse);
      const result = await provider.resolveStringEvaluation('flag-key', 'default', mockContext);

      expect(mockEvaluate).toHaveBeenCalled();
      expect(result).toEqual({
        value: 'test-value',
        variant: 'test-value',
        reason: 'EVALUATED',
      });
    });
  });

  describe('resolveNumberEvaluation', () => {
    it('should return a number evaluation', async () => {
      const mockEvaluationResponse: EvaluationResponse = {
        toggles: {
          'flag-key': createMockEvaluation('flag-key', 42, 'number'),
        },
      };

      const mockEvaluate = vi.spyOn(HyphenClient.prototype, 'evaluate').mockResolvedValue(mockEvaluationResponse);
      const result = await provider.resolveNumberEvaluation('flag-key', 0, mockContext);

      expect(mockEvaluate).toHaveBeenCalled();
      expect(result).toEqual({
        value: 42,
        variant: '42',
        reason: 'EVALUATED',
      });
    });
  });

  describe('resolveObjectEvaluation', () => {
    it('should return an object evaluation', async () => {
      const mockObjectValue = { key: 'value' };
      const mockEvaluationResponse: EvaluationResponse = {
        toggles: {
          'flag-key': createMockEvaluation('flag-key', JSON.stringify(mockObjectValue), 'object'),
        },
      };

      const mockEvaluate = vi.spyOn(HyphenClient.prototype, 'evaluate').mockResolvedValue(mockEvaluationResponse);
      const result = await provider.resolveObjectEvaluation('flag-key', {}, mockContext);

      expect(mockEvaluate).toHaveBeenCalled();
      expect(result).toEqual({
        value: mockObjectValue,
        variant: JSON.stringify(mockObjectValue),
        reason: 'EVALUATED',
      });
    });

    it('should return a type mismatch error if the evaluation type is not object', async () => {
      const mockEvaluationResponse: EvaluationResponse = {
        toggles: {
          'flag-key': createMockEvaluation('flag-key', 'not-an-object', 'string'),
        },
      };

      const mockEvaluate = vi.spyOn(HyphenClient.prototype, 'evaluate').mockResolvedValue(mockEvaluationResponse);

      const result = await provider.resolveObjectEvaluation('flag-key', {}, mockContext);

      expect(mockEvaluate).toHaveBeenCalled();
      expect(result).toEqual({
        value: {},
        reason: 'ERROR',
        errorCode: 'TYPE_MISMATCH',
      });
    });
  });

  describe('validateEnvironmentFormat', () => {
    it('should accept a valid project environment ID', () => {
      expect(() => provider['validateEnvironmentFormat']('env_abc123')).not.toThrow();
    });

    it('should accept a valid alternateId', () => {
      expect(() => provider['validateEnvironmentFormat']('production')).not.toThrow();
      expect(() => provider['validateEnvironmentFormat']('staging-env')).not.toThrow();
      expect(() => provider['validateEnvironmentFormat']('dev_test_123')).not.toThrow();
    });

    it('should reject an invalid environment format', () => {
      expect(() => provider['validateEnvironmentFormat']('INVALID_UPPERCASE')).toThrowError(
        'Invalid environment format'
      );
      expect(() => provider['validateEnvironmentFormat']('a'.repeat(26))).toThrowError(
        'Invalid environment format'
      );
      expect(() => provider['validateEnvironmentFormat']('invalid@character')).toThrowError(
        'Invalid environment format'
      );
      expect(() => provider['validateEnvironmentFormat']('environments')).toThrowError(
        'Invalid environment format'
      );
    });
  });

  describe('validateContext', () => {
    it('should throw an error if context is missing required fields', () => {
      expect(() => provider['validateContext'](null as any)).toThrowError('Evaluation context is required');
      expect(() => provider['validateContext']({ targetingKey: 'key' } as any)).toThrowError(
        'application is required',
      );
      expect(() => provider['validateContext']({ application: 'test' } as any)).toThrowError(
        'targetingKey is required',
      );
      expect(() => provider['validateContext']({ targetingKey: 'key', application: 'test' } as any)).toThrowError(
        'environment is required',
      );
    });

    it('should return the context if all required fields are present with valid environment format', () => {
      // With alternateId format
      const result1 = provider['validateContext']({
        targetingKey: 'key',
        application: 'test',
        environment: 'test-env',
      } as any);

      expect(result1).toEqual({
        targetingKey: 'key',
        application: 'test',
        environment: 'test-env',
      });

      // With project environment ID format
      const result2 = provider['validateContext']({
        targetingKey: 'key',
        application: 'test',
        environment: 'env_abc123',
      } as any);

      expect(result2).toEqual({
        targetingKey: 'key',
        application: 'test',
        environment: 'env_abc123',
      });
    });

    it('should throw an error if environment has invalid format', () => {
      expect(() => provider['validateContext']({
        targetingKey: 'key',
        application: 'test',
        environment: 'INVALID_UPPERCASE',
      } as any)).toThrowError('Invalid environment format');
    });
  });
});
