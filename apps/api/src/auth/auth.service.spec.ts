import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { hashSync } from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@leads/db';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService, INVALID_CREDENTIALS } from './auth.service';
import { hashRefreshToken } from './refresh-hash';
import { TokenService } from './token.service';

const tokens = new TokenService(new JwtService(), {
  accessSecret: 'a',
  refreshSecret: 'r',
  accessTtl: '15m',
  refreshTtl: '7d',
});

function makeUser(): User {
  return {
    id: 'u1',
    email: 'sales@demo.local',
    passwordHash: hashSync('demo1234', 4),
    displayName: 'Demo Sales',
    role: 'USER',
    refreshTokenHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('AuthService', () => {
  let stored: User;
  let service: AuthService;
  const update = vi.fn();

  beforeEach(() => {
    stored = makeUser();
    update.mockReset();
    update.mockImplementation(({ data }: { data: { refreshTokenHash: string } }) => {
      stored = { ...stored, refreshTokenHash: data.refreshTokenHash };
      return Promise.resolve(stored);
    });
    const prisma = {
      user: {
        findUnique: vi.fn(({ where }: { where: { email?: string; id?: string } }) =>
          Promise.resolve(where.email === stored.email || where.id === stored.id ? stored : null),
        ),
        update,
      },
    } as unknown as PrismaService;
    service = new AuthService(prisma, tokens);
  });

  it('logs in and stores only the hash of the refresh token', async () => {
    const res = await service.login('sales@demo.local', 'demo1234');
    expect(res.user).toEqual({
      id: 'u1',
      email: 'sales@demo.local',
      displayName: 'Demo Sales',
      role: 'user',
    });
    expect((await tokens.verifyAccess(res.accessToken))?.id).toBe('u1');
    expect(stored.refreshTokenHash).toBe(hashRefreshToken(res.refreshToken));
    expect(stored.refreshTokenHash).not.toContain(res.refreshToken);
  });

  it('uses the same error for unknown email and wrong password', async () => {
    const wrongPassword = await service.login('sales@demo.local', 'nope').catch((e: unknown) => e);
    const unknownEmail = await service
      .login('ghost@demo.local', 'demo1234')
      .catch((e: unknown) => e);
    expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
    expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
    expect((wrongPassword as Error).message).toBe(INVALID_CREDENTIALS);
    expect((unknownEmail as Error).message).toBe(INVALID_CREDENTIALS);
    expect(update).not.toHaveBeenCalled();
  });

  it('rotates tokens and invalidates the old refresh token', async () => {
    const first = await service.login('sales@demo.local', 'demo1234');
    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh(second.refreshToken)).resolves.toBeDefined();
  });

  it('rejects an access token or garbage as refresh token', async () => {
    const res = await service.login('sales@demo.local', 'demo1234');
    await expect(service.refresh(res.accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns the current user', async () => {
    expect((await service.me('u1')).email).toBe('sales@demo.local');
    await expect(service.me('missing')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
