export const horizon = {
  url: `https://horizon.hyphen.ai/toggle`,
};

export const horizonEndpoints = {
  evaluate: `${horizon.url}/evaluate`,
  telemetry: `${horizon.url}/telemetry`,
};

export const cache = {
  ttlSeconds: process.env.CACHE_TTL_SECONDS ? parseInt(process.env.CACHE_TTL_SECONDS) : 30,
}
