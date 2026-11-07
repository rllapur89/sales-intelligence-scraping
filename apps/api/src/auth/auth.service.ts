import { Injectable, UnauthorizedException } from '@nestjs/common';
import { compare } from 'bcryptjs';
import type { User } from '@leads/db';
import type { AuthResponse, AuthUserDto } from '@leads/shared';
import { PrismaService } from '../prisma/prisma.service';
import { hashRefreshToken, refreshTokenMatches } from './refresh-hash';
import { TokenService, type AuthUser } from './token.service';

export const INVALID_CREDENTIALS = 'Invalid email or password';
export const INVALID_REFRESH = 'Invalid refresh token';

export function toAuthUserDto(user: User): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role === 'ADMIN' ? 'admin' : 'user',
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Same error for unknown email and wrong password: no account enumeration.
    if (!user || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.issue(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const identity = await this.tokens.verifyRefresh(refreshToken);
    if (!identity) throw new UnauthorizedException(INVALID_REFRESH);
    const user = await this.prisma.user.findUnique({ where: { id: identity.id } });
    if (!user || !refreshTokenMatches(refreshToken, user.refreshTokenHash)) {
      throw new UnauthorizedException(INVALID_REFRESH);
    }
    return this.issue(user);
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException(INVALID_REFRESH);
    return toAuthUserDto(user);
  }

  private async issue(user: User): Promise<AuthResponse> {
    const dto = toAuthUserDto(user);
    const identity: AuthUser = { id: dto.id, email: dto.email, role: dto.role };
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccess(identity),
      this.tokens.signRefresh(identity),
    ]);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hashRefreshToken(refreshToken) },
    });
    return { accessToken, refreshToken, user: dto };
  }
}
