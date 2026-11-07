import { createHash, timingSafeEqual } from 'node:crypto';

/** SHA-256 (not bcrypt: bcrypt truncates at 72 bytes and JWT prefixes are near-identical). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenMatches(token: string, storedHash: string | null): boolean {
  if (storedHash === null) return false;
  const a = Buffer.from(hashRefreshToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
