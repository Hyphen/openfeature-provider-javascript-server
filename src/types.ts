import type { EvaluationContext } from '@openfeature/server-sdk';

export type HyphenProviderOptions = {
  /** The application name or application id */
  application: string;
  /** The environment for the Hyphen project */
  environment: string;
  /** The Hyphen server URL */
  horizonServerUrls?: string[];
};

export interface HyphenEvaluationContext extends EvaluationContext {
  /** The key to use for caching the evaluation response */
  targetingKey: string;
  /** The IP address of the user */
  ipAddress: string;
  /** The application name or application id */
  application: string;
  /** The environment for the Hyphen project */
  environment: string;
  /** Custom attributes */
  customAttributes: Record<string, any>;
  /** User object */
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
