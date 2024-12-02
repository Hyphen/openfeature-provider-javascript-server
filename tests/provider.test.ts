import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyphenProvider } from '../src';
import type { HookContext } from '@openfeature/server-sdk';
import { HyphenClient } from '../src/hyphenClient';
import type { Evaluation, EvaluationResponse } from '../src/types';

vi.mock('./hyphenClient');

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
    horizonServerUrls: ['https://test-server.com'],
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

    // it('should generate a random key if neither targetingKey nor user ID is present', () => {
    //   const key = provider['getTargetingKey']({} as any);
    //   expect(key).toMatch(new RegExp(`^${options.application}-${options.environment}-[a-z0-9]+$`));
    // });
  });

  describe('Hooks', () => {
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

    it('should log usage in finallyHook', async () => {
      const mockLogger = { info: vi.fn() };
      const hookContext: HookContext = { logger: mockLogger } as any;

      await provider.finallyHook(hookContext);

      expect(mockLogger.info).toHaveBeenCalledWith('logging usage');
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
      const result = await provider.resolveBooleanEvaluation('flag-key', false, mockContext);

      expect(mockEvaluate).toHaveBeenCalled();
      expect(result).toEqual({
        value: false,
        errorMessage: 'Evaluation failed',
        errorCode: 'GENERAL',
      });
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

    it('should return the context if all required fields are present', () => {
      const result = provider['validateContext']({
        targetingKey: 'key',
        application: 'test',
        environment: 'test-env',
      } as any);

      expect(result).toEqual({
        targetingKey: 'key',
        application: 'test',
        environment: 'test-env',
      });
    });
  });
});