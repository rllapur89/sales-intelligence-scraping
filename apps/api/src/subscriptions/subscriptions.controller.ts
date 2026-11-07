import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SubscriptionDto } from '@leads/shared';
import { CurrentUser } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/token.service';
import { CreateSubscriptionDto, UpdateSubscriptionDto } from './subscriptions.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Subscriptions of the authenticated user' })
  list(@CurrentUser() user: AuthUser): Promise<SubscriptionDto[]> {
    return this.subscriptions.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    return this.subscriptions.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    return this.subscriptions.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    return this.subscriptions.remove(user.id, id);
  }
}
