import {
  createParamDecorator,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TokenService, type AuthUser } from './token.service';

export type AuthenticatedRequest = Request & { user?: AuthUser };

/** Extracts the token from an `Authorization: Bearer <token>` header value. */
export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) return null;
  return token;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.tokens.verifyAccess(extractBearer(request.headers.authorization));
    if (!user) throw new UnauthorizedException('Missing or invalid access token');
    request.user = user;
    return true;
  }
}

/** Injects the authenticated user set by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();
    return request.user;
  },
);
