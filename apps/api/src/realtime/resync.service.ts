import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LeadDto, ResyncResponse, SubscriptionFilter } from '@leads/shared';
import { PrismaService } from '../prisma/prisma.service';
import { buildReplayBatches, planResync, type ReplayRow } from './resync';

export function readPositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

@Injectable()
export class ResyncService {
  private readonly maxGap: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.maxGap = readPositiveInt(config.get<string>('GATEWAY_REPLAY_MAX_GAP'), 5000);
  }

  async currentSeq(): Promise<number> {
    const agg = await this.prisma.leadEvent.aggregate({ _max: { seq: true } });
    return Number(agg._max.seq ?? 0);
  }

  async resync(lastSeq: number, filters: readonly SubscriptionFilter[]): Promise<ResyncResponse> {
    const currentSeq = await this.currentSeq();
    const plan = planResync(lastSeq, currentSeq, this.maxGap);
    if (plan.mode === 'full') return { mode: 'full', reason: plan.reason, currentSeq };

    const events = await this.prisma.leadEvent.findMany({
      where: { seq: { gt: BigInt(plan.afterSeq), lte: BigInt(currentSeq) } },
      orderBy: { seq: 'asc' },
    });
    const rows: ReplayRow[] = events.map((e) => {
      const lead = e.payload as unknown as LeadDto;
      return {
        seq: Number(e.seq),
        lead: { ...lead, seq: Number(e.seq) },
        timings: { scrapedAt: e.scrapedAt.getTime(), ingestedAt: e.ingestedAt.getTime() },
      };
    });
    return {
      mode: 'delta',
      batches: buildReplayBatches(rows, filters, Date.now()),
      currentSeq,
    };
  }
}
