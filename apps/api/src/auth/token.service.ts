import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { UserRole } from '@leads/shared';

export const AUTH_SETTINGS = Symbol('AUTH_SETTINGS');

export interface AuthSettings {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: string;
  refreshTtl: string;
}

/** Identity extracted from a verified token. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

interface TokenClaims {
  sub: string;
  email: string;
  role: UserRole;
  typ: 'access' | 'refresh';
  jti?: string;
}

function isClaims(value: unknown, typ: TokenClaims['typ']): value is TokenClaims {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v['typ'] === typ &&
    typeof v['sub'] === 'string' &&
    typeof v['email'] === 'string' &&
    (v['role'] === 'admin' || v['role'] === 'user')
  );
}

/** Signs and verifies the access/refresh JWT pair. Shared by REST guard and socket handshake. */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  signAccess(user: AuthUser): Promise<string> {
    return this.sign(user, 'access', this.settings.accessSecret, this.settings.accessTtl);
  }

  /** Includes a random `jti`, so two refresh tokens issued in the same second still differ. */
  signRefresh(user: AuthUser): Promise<string> {
    return this.sign(user, 'refresh', this.settings.refreshSecret, this.settings.refreshTtl);
  }

  verifyAccess(token: unknown): Promise<AuthUser | null> {
    return this.verify(token, 'access', this.settings.accessSecret);
  }

  verifyRefresh(token: unknown): Promise<AuthUser | null> {
    return this.verify(token, 'refresh', this.settings.refreshSecret);
  }

  private sign(
    user: AuthUser,
    typ: TokenClaims['typ'],
    secret: string,
    ttl: string,
  ): Promise<string> {
    const claims: TokenClaims = {
      sub: user.id,
      email: user.email,
      role: user.role,
      typ,
      jti: randomUUID(),
    };
    return this.jwt.signAsync(claims, {
      secret,
      expiresIn: ttl as JwtSignOptions['expiresIn'],
    });
  }

  private async verify(
    token: unknown,
    typ: TokenClaims['typ'],
    secret: string,
  ): Promise<AuthUser | null> {
    if (typeof token !== 'string' || token === '') return null;
    try {
      const claims: unknown = await this.jwt.verifyAsync(token, { secret });
      if (!isClaims(claims, typ)) return null;
      return { id: claims.sub, email: claims.email, role: claims.role };
    } catch {
      return null;
    }
  }
}
