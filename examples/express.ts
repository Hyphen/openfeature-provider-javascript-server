import express from 'express';
import { OpenFeature } from '@openfeature/server-sdk';
import {
  type HyphenEvaluationContext,
  HyphenProvider,
  type HyphenProviderOptions,
} from 'openfeature-provider-javascript-server';

const app = express();
const port = 3000;

const publicKey = "your-public-key";

const options: HyphenProviderOptions = {
  application: 'application-id',
  environment: 'production',
};

// Register the HyphenProvider
await OpenFeature.setProviderAndWait(new HyphenProvider(publicKey, options));

// Middleware to add a simple evaluation context
app.use((req, res, next) => {
  req.context = {
    ...options,
    targetingKey: 'example-user-id',
    ipAddress: req.ip,
    customAttributes: {
      region: 'us-east',
    },
    user: {
      id: 'example-user-id',
      email: 'example@example.com',
      name: 'Example User',
      customAttributes: {
        role: 'basic',
      },
    },
  } as HyphenEvaluationContext;
  next();
});

// Route to evaluate a feature flag
app.get('/feature-flag', async (req, res) => {
  const client = OpenFeature.getClient();
  const flagDetails = await client.getBooleanDetails('example-feature', false, req.context);

  res.json({
    featureFlag: 'example-feature',
    value: flagDetails.value,
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
