import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@leads/db';
import type { LeadDto, Page, PipelineStage, SignalDto } from '@leads/shared';
import { toLeadDto, toSignalDto, toDbStage, fromDbStage } from '../common/mappers';
import { stageChangedActivity, toActivityCreate } from '../crm/crm-rules';
import { PrismaService } from '../prisma/prisma.service';
import type { ListLeadsQueryDto } from './leads.dto';
import { buildLeadListWhere, buildLeadOrderBy, leadCursorFor, sliceKeysetPage } from './lead-query';

export const LEAD_DETAIL_SIGNALS = 50;

const leadNotFoundError = (id: string): NotFoundException =>
  new NotFoundException(`Lead ${id} not found`);

export type LeadDetailDto = LeadDto & { signals: SignalDto[] };

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListLeadsQueryDto): Promise<Page<LeadDto>> {
    const where = buildLeadListWhere(query, query.sort, query.cursor);
    const rows = await this.prisma.lead.findMany({
      where,
      orderBy: buildLeadOrderBy(query.sort),
      take: query.limit + 1,
      include: { company: true },
    });
    const page = sliceKeysetPage(rows, query.limit, (row) => leadCursorFor(query.sort, row));
    return { items: page.items.map(toLeadDto), nextCursor: page.nextCursor };
  }

  async get(id: string): Promise<LeadDetailDto> {
    const lead = await this.prisma.lead.findUnique({ where: { id }, include: { company: true } });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    const signals = await this.prisma.signal.findMany({
      where: { companyId: lead.companyId },
      orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
      take: LEAD_DETAIL_SIGNALS,
      include: { source: true },
    });
    return { ...toLeadDto(lead), signals: signals.map(toSignalDto) };
  }

  /**
   * Bumps updatedAt (via @updatedAt) and deliberately writes no LeadEvent (stage is not a live-feed
   * concern). A real change also records `stage_changed` in the same transaction; setting the
   * current stage again records nothing.
   */
  async updateStage(
    id: string,
    stage: PipelineStage,
    actorId: string | null = null,
  ): Promise<LeadDto> {
    try {
      const lead = await this.prisma.$transaction(async (tx) => {
        const current = await tx.lead.findUnique({ where: { id }, select: { stage: true } });
        if (!current) throw leadNotFoundError(id);
        const updated = await tx.lead.update({
          where: { id },
          data: { stage: toDbStage(stage) },
          include: { company: true },
        });
        const from = fromDbStage(current.stage);
        if (from !== stage) {
          await tx.leadActivity.create({
            data: toActivityCreate(id, actorId, stageChangedActivity(from, stage)),
          });
        }
        return updated;
      });
      return toLeadDto(lead);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Lead ${id} not found`);
      }
      throw error;
    }
  }
}
