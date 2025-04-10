# Hyphen Toggle OpenFeature Provider

The **Hyphen Toggle OpenFeature Provider** is an OpenFeature provider implementation for the Hyphen Toggle platform. It enables feature flag evaluation using the OpenFeature standard.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Usage](#usage)
3. [Configuration](#configuration)
4. [Contributing](#contributing)
5. [License](#license)

---

## Getting Started

### Installation

Install the provider and the OpenFeature server SDK:

```bash
npm install @openfeature/server-sdk @hyphen/openfeature-server-provider
```

## Usage

### Basic Setup

To integrate the Hyphen Toggle provider into your application, follow these steps:

1. **Set up the provider**: Register the `HyphenProvider` with OpenFeature using your `publicKey` and provider options.
2. **Register the provider with OpenFeature**

```typescript
import { OpenFeature } from '@openfeature/server-sdk';
import { HyphenProvider, type HyphenProviderOptions } from '@hyphen/openfeature-server-provider';

const publicKey = "your-public-key-here";

// Example using an alternateId for environment
const options: HyphenProviderOptions = {
  application: 'your-application-name',
  environment: 'production', // Using alternateId format
};

// OR using a project environment ID
// const options: HyphenProviderOptions = {
//   application: 'your-application-name',
//   environment: 'pevr_abc123', // Using project environment ID format
// };

await OpenFeature.setProviderAndWait(new HyphenProvider(publicKey, options));
```

3. **Configure the context**: Define and pass an `EvaluationContext` needed for feature targeting evaluations, incorporating user or application context.
```typescript
const context: HyphenEvaluationContext = {
  targetingKey: 'user-123',
  // You can specify the environment in the context
  environment: 'production', // or 'pevr_abc123'
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

```

### Example: Context Evaluation
Evaluate a feature flag using the OpenFeature client and context information:


```TypeScript
// Evaluate the toggle with context
const flagDetailsWithContext = await client.getBooleanDetails(toggleKey, defaultValue, context);

console.log(flagDetailsWithContext.value); // true or false
```

## Configuration

### Options

| Option              | Type       | Required | Description                                                                                |
| :------------------ | :--------- | :------- | :----------------------------------------------------------------------------------------- |
| `application`       | `string`   | Yes      | The application id or alternate ID.                                                        |
| `environment`       | `string`   | Yes      | The environment identifier for the Hyphen project (project environment ID or alternateId). |
| `horizonUrls`       | `string[]` | No       | Hyphen Horizon URLs for fetching flags.                                                    |
| `enableToggleUsage` | `boolean`  | No       | Enable/disable telemetry (default: true).                                                  |
| `cache`             | object     | No       | Configuration for caching feature flag evaluations.                                        |

### Cache Configuration

The `cache` option accepts the following properties:

| Property              | Type       | Default | Description                                                    |
|----------------------|------------|---------|----------------------------------------------------------------|
| `ttlSeconds`         | number     | 300     | Time-to-live in seconds for cached flag evaluations.           |
| `generateCacheKeyFn` | Function   | -       | Custom function to generate cache keys from evaluation context. |

Example with cache configuration:

```typescript
const options: HyphenProviderOptions = {
  application: 'your-application-name',
  // Using alternateId format:
  environment: 'production',
  // OR using project environment ID format:
  // environment: 'pevr_abc123',
  cache: {
    ttlSeconds: 600, // 10 minutes
    generateCacheKeyFn: (context: HyphenEvaluationContext) => {
      return `${context.targetingKey}-${context.user?.id}`;
    },
  },
};
```

### Context

Provide an `EvaluationContext` to pass contextual data for feature evaluation.

### Context Fields
| Field                   | Type                  | Required | Description                                                        |
| ----------------------- | --------------------- | :------- | ------------------------------------------------------------------ |
| `targetingKey`          | `string`              | Yes      | The key used for caching the evaluation response.                  |
| `ipAddress`             | `string`              | No       | The IP address of the user making the request.                     |
| `customAttributes`      | `Record<string, any>` | No       | Custom attributes for additional contextual information.           |
| `user`                  | `object`              | No       | An object containing user-specific information for the evaluation. |
| `user.id`               | `string`              | No       | The unique identifier of the user.                                 |
| `user.email`            | `string`              | No       | The email address of the user.                                     |
| `user.name`             | `string`              | No       | The name of the user.                                              |
| `user.customAttributes` | `Record<string, any>` | No       | Custom attributes specific to the user.                            |

## Contributing

We welcome contributions to this project! If you'd like to contribute, please follow the guidelines outlined in [CONTRIBUTING.md](CONTRIBUTING.md). Whether it's reporting issues, suggesting new features, or submitting pull requests, your help is greatly appreciated!

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for full details.
