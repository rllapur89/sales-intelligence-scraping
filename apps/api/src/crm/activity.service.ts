import { Injectable } from '@nestjs/common';
import { toActivityDto, type ActivityDto, type Page } from '@leads/shared';
import { sliceKeysetPage } from '../leads/lead-query';
import { PrismaService } from '../prisma/prisma.service';
import { ACTIVITY_ORDER_BY, activityCursorFor, buildActivityPageWhere } from './crm-rules';
import { requireLead } from './lead-lookup';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first with keyset pagination (createdAt desc, id desc). */
  async list(
    leadId: string,
    query: { limit: number; cursor?: string },
  ): Promise<Page<ActivityDto>> {
    await requireLead(this.prisma, leadId);
    const rows = await this.prisma.leadActivity.findMany({
      where: buildActivityPageWhere(leadId, query.cursor),
      orderBy: ACTIVITY_ORDER_BY,
      take: query.limit + 1,
    });
    const page = sliceKeysetPage(rows, query.limit, activityCursorFor);
    return { items: page.items.map(toActivityDto), nextCursor: page.nextCursor };
  }
}
