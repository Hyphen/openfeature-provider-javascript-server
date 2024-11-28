export const horizon = {
  url: `https://${process.env.NODE_ENV === 'production' ? 'horizon' : 'dev-horizon'}.hyphen.ai/toggle/evaluate`,
};

export const cache = {
  ttlSeconds: process.env.CACHE_TTL ? parseInt(process.env.CACHE_TTL) : 30,
}
