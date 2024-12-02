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


// Route for a feature toggle that enables or disables a beta API endpoint
app.get('/api/beta', async (req, res) => {
  const client = OpenFeature.getClient();
  const betaFeatureFlag = await client.getBooleanValue('enable-beta-api', false, req.context);

  if (betaFeatureFlag) {
    // Logic for when the beta API is enabled
    res.json({
      message: 'Welcome to the Beta API!',
      data: { example: 'This is some beta API data.' },
    });
  } else {
    // Logic for when the beta API is disabled
    res.status(404).json({
      message: 'The Beta API is not available.',
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
