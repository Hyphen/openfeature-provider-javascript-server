export function getOrgIdFromPublicKey(publicKey: string) {
  try {
    const keyWithoutPrefix = publicKey.replace(/^public_/, '');
    const decoded = Buffer.from(keyWithoutPrefix, 'base64').toString();
    const [orgId] = decoded.split(':');
    return orgId;
  } catch {
    return undefined;
  }
}

export function buildDefaultHorizonUrl(publicKey: string): string {
  const orgId = getOrgIdFromPublicKey(publicKey);
  return orgId ? `https://${orgId}.toggle.hyphen.cloud` : 'https://toggle.hyphen.cloud';
}
