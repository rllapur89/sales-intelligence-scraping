import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { MarkReadResponse, NotificationDto, Page, UnreadCountDto } from '@leads/shared';
import { CurrentUser } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/token.service';
import { MarkReadDto, NotificationsQueryDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

export const MARK_READ_TARGET_MESSAGE = 'Provide a non-empty "ids" list or "all": true';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'My notifications, newest first, keyset pagination' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: NotificationsQueryDto,
  ): Promise<Page<NotificationDto>> {
    return this.notifications.list(user.id, query);
  }

  /** Declared before any `:id` route so `unread-count` is never read as an id. */
  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications' })
  unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCountDto> {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark my notifications as read (specific ids or all)' })
  markRead(@CurrentUser() user: AuthUser, @Body() body: MarkReadDto): Promise<MarkReadResponse> {
    if (body.all !== true && (body.ids === undefined || body.ids.length === 0)) {
      throw new BadRequestException(MARK_READ_TARGET_MESSAGE);
    }
    return this.notifications.markRead(user.id, body);
  }
}
