export const horizon = {
  url: `https://${process.env.NODE_ENV === 'production' ? 'horizon' : 'dev-horizon'}.hyphen.ai/toggle/evaluate`,
};

export const cache = {
  ttl: process.env.CACHE_TTL ? parseInt(process.env.CACHE_TTL) : 30,
}
