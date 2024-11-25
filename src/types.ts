import { EvaluationContext } from '@openfeature/server-sdk';

export type clientContext = {
  targetingKey: string;
  ipAddress?: string;
  customAttributes?: Record<string, any>;
  user?: {
    id: string;
    email?: string;
    name?: string;
    customAttributes?: Record<string, any>;
  };
} & EvaluationContext;

export type HyphenProviderOptions = {
  application: string;
  environment: string;
}

export interface HyphenEvaluationContext extends EvaluationContext {
  targetingKey: string;
  ipAddress: string;
  application: string;
  environment: string;
  customAttributes: Record<string, any>;
  user: {
    id: string;
    email: string;
    name: string;
    customAttributes: Record<string, any>;
  };
}

export interface Evaluation {
  key: string;
  value: boolean | string | number | Record<string, any>;
  type: 'boolean' | 'string' | 'number' | 'object';
  reason: string;
  errorMessage: string;
}

export interface EvaluationResponse {
  toggles: Record<string, Evaluation>;
}
