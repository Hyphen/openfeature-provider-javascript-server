import { OpenFeature } from '@openfeature/server-sdk';
import {
  HyphenProvider,
  type HyphenProviderOptions,
  type HyphenEvaluationContext,
} from '@hyphen/openfeature-server-provider';

const publicKey = 'your-public-key';

const options: HyphenProviderOptions = {
  application: 'application-id',
  environment: 'production',
};

const context: HyphenEvaluationContext = {
  targetingKey: 'user-123',
  ipAddress: '203.0.113.42',
  customAttributes: {
    subscriptionLevel: 'premium',
    region: 'us-east',
  },
  user: {
    id: 'user-123',
    email: 'user@example.com',
    name: 'John Doe',
    customAttributes: {
      role: 'admin',
    },
  },
};

// Register your feature flag provider
await OpenFeature.setProviderAndWait(new HyphenProvider(publicKey, options));

// create a new client
const client = OpenFeature.getClient();

// Evaluate your feature flag
const data = await client.getBooleanDetails('my-bool-toggle', false, context);

console.log('Data', data.value); // true or false
