import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthResponse, AuthUserDto } from '@leads/shared';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './auth.dto';
import { CurrentUser } from './jwt-auth.guard';
import { Public } from './public.decorator';
import type { AuthUser } from './token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange credentials for an access/refresh token pair' })
  login(@Body() body: LoginDto): Promise<AuthResponse> {
    return this.auth.login(body.email, body.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate both tokens; the old refresh token stops working' })
  refresh(@Body() body: RefreshDto): Promise<AuthResponse> {
    return this.auth.refresh(body.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user' })
  me(@CurrentUser() user: AuthUser): Promise<AuthUserDto> {
    return this.auth.me(user.id);
  }
}
