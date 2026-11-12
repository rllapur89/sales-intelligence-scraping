import { Injectable } from '@nestjs/common';
import type { LeadDto } from '@leads/shared';
import type { AuthUser } from '../auth/token.service';
import { toLeadDto } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import { assignedActivity, toActivityCreate } from './crm-rules';
import { leadNotFound, requireUser } from './lead-lookup';

@Injectable()
export class AssigneeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sets or clears the lead owner and records `assigned`. Re-assigning the same owner is a no-op. */
  async assign(leadId: string, actor: AuthUser, assigneeId: string | null): Promise<LeadDto> {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { company: true },
    });
    if (!lead) throw leadNotFound(leadId);
    if (lead.assigneeId === assigneeId) return toLeadDto(lead);
    if (assigneeId !== null) await requireUser(this.prisma, assigneeId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.lead.update({
        where: { id: leadId },
        data: { assigneeId },
        include: { company: true },
      });
      await tx.leadActivity.create({
        data: toActivityCreate(leadId, actor.id, assignedActivity(lead.assigneeId, assigneeId)),
      });
      return row;
    });
    return toLeadDto(updated);
  }
}
