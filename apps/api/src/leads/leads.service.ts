import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@leads/db';
import type { LeadDto, Page, PipelineStage, SignalDto } from '@leads/shared';
import { toLeadDto, toSignalDto, toDbStage } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import type { ListLeadsQueryDto } from './leads.dto';
import { buildLeadListWhere, buildLeadOrderBy, leadCursorFor, sliceKeysetPage } from './lead-query';

export const LEAD_DETAIL_SIGNALS = 50;

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

  /** Bumps updatedAt (via @updatedAt) and deliberately writes no LeadEvent (stage is not a live-feed concern). */
  async updateStage(id: string, stage: PipelineStage): Promise<LeadDto> {
    try {
      const lead = await this.prisma.lead.update({
        where: { id },
        data: { stage: toDbStage(stage) },
        include: { company: true },
      });
      return toLeadDto(lead);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Lead ${id} not found`);
      }
      throw error;
    }
  }
}
