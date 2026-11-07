import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AUTH_SETTINGS, TokenService, type AuthSettings } from './token.service';

export function readAuthSettings(get: (key: string) => string | undefined): AuthSettings {
  const need = (key: string): string => {
    const value = get(key);
    if (!value) throw new Error(`Missing required environment variable ${key}`);
    return value;
  };
  return {
    accessSecret: need('JWT_ACCESS_SECRET'),
    refreshSecret: need('JWT_REFRESH_SECRET'),
    accessTtl: get('JWT_ACCESS_TTL') || '15m',
    refreshTtl: get('JWT_REFRESH_TTL') || '7d',
  };
}

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AuthSettings =>
        readAuthSettings((key) => config.get<string>(key)),
    },
    TokenService,
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
