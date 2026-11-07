import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { TokenService, type AuthSettings, type AuthUser } from './token.service';

const settings: AuthSettings = {
  accessSecret: 'access-secret',
  refreshSecret: 'refresh-secret',
  accessTtl: '15m',
  refreshTtl: '7d',
};
const user: AuthUser = { id: 'u1', email: 'a@demo.local', role: 'admin' };
const make = (s: AuthSettings = settings): TokenService => new TokenService(new JwtService(), s);

describe('TokenService (JWT handshake verification)', () => {
  it('verifies a valid access token', async () => {
    const tokens = make();
    expect(await tokens.verifyAccess(await tokens.signAccess(user))).toEqual(user);
  });

  it('rejects garbage, empty and non-string tokens', async () => {
    const tokens = make();
    expect(await tokens.verifyAccess('not-a-jwt')).toBeNull();
    expect(await tokens.verifyAccess('')).toBeNull();
    expect(await tokens.verifyAccess(undefined)).toBeNull();
    expect(await tokens.verifyAccess(42)).toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const other = make({ ...settings, accessSecret: 'other' });
    expect(await make().verifyAccess(await other.signAccess(user))).toBeNull();
  });

  it('rejects an expired token', async () => {
    const short = make({ ...settings, accessTtl: '1ms' });
    const token = await short.signAccess(user);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await short.verifyAccess(token)).toBeNull();
  });

  it('does not accept a refresh token as an access token and vice versa', async () => {
    const tokens = make();
    expect(await tokens.verifyAccess(await tokens.signRefresh(user))).toBeNull();
    expect(await tokens.verifyRefresh(await tokens.signAccess(user))).toBeNull();
  });

  it('issues different refresh tokens in the same second', async () => {
    const tokens = make();
    expect(await tokens.signRefresh(user)).not.toBe(await tokens.signRefresh(user));
  });
});
