export const horizon = {
  url: `https://horizon.hyphen.ai`,
};

export const cache = {
  ttlSeconds: process.env.CACHE_TTL_SECONDS ? parseInt(process.env.CACHE_TTL_SECONDS) : 30,
};
