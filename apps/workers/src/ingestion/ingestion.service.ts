import { Logger } from '@nestjs/common';
import {
  Prisma,
  type PrismaClient,
  type SignalType as DbSignalType,
  type SourceKey as DbSourceKey,
} from '@leads/db';
import {
  fromDbSourceKey,
  toDbSourceKey,
  type CompanyDto,
  type CompanySize,
  type LeadDto,
  type LeadUpsertedEvent,
  type PipelineStage,
  type RawScrapeResult,
  type SignalType,
} from '@leads/shared';
import {
  groupByCompany,
  mergeEnrichment,
  normalizeItem,
  type NormalizedItem,
  type RejectReason,
} from './normalize';
import { scoreLead } from './score';

/** Delivers committed events to the API instances (Redis pub/sub in production). */
export interface EventPublisher {
  publish(event: LeadUpsertedEvent): Promise<void>;
}

export interface IngestOutcome {
  domain: string;
  /** `null` when nothing changed (idempotent re-run): no event is emitted. */
  seq: number | null;
  newSignals: number;
}

export interface IngestSummary {
  outcomes: IngestOutcome[];
  rejected: Record<RejectReason, number>;
  /** Companies whose transaction failed; the caller should retry the whole result. */
  failedDomains: string[];
}

const toDbSignal = (t: SignalType): DbSignalType =>
  t.toUpperCase().replace(/-/g, '_') as DbSignalType;
const fromDbSignal = (t: string): SignalType => t.toLowerCase().replace(/_/g, '-') as SignalType;

function payloadKind(payload: Prisma.JsonValue): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const kind = payload['kind'];
  return typeof kind === 'string' ? kind : null;
}

export function toLeadDto(
  lead: {
    id: string;
    score: number;
    stage: string;
    signalTypes: string[];
    signalCount: number;
    seq: bigint;
    updatedAt: Date;
  },
  company: {
    id: string;
    domain: string;
    name: string;
    industry: string | null;
    region: string | null;
    size: string | null;
    description: string | null;
    techHints: string[];
  },
): LeadDto {
  const companyDto: CompanyDto = {
    id: company.id,
    domain: company.domain,
    name: company.name,
    industry: company.industry,
    region: company.region,
    size: company.size ? (company.size.toLowerCase().replace(/_/g, '-') as CompanySize) : null,
    description: company.description,
    techHints: company.techHints,
  };
  return {
    id: lead.id,
    company: companyDto,
    score: lead.score,
    stage: lead.stage.toLowerCase() as PipelineStage,
    signalTypes: lead.signalTypes.map(fromDbSignal),
    signalCount: lead.signalCount,
    seq: Number(lead.seq),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

/**
 * Normalizes, dedupes by company domain, scores and upserts. Each company is one transaction:
 * Company + Signals + Lead + LeadEvent commit together or not at all. The event is published only
 * after commit; if publishing fails the LeadEvent row still exists, so clients recover through resync.
 */
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly sourceIds = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly publisher: EventPublisher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async ingest(result: RawScrapeResult): Promise<IngestSummary> {
    const rejected: Record<RejectReason, number> = {
      'invalid-domain': 0,
      'invalid-name': 0,
      'invalid-signal': 0,
      'personal-data': 0,
    };
    const valid: NormalizedItem[] = [];
    for (const raw of result.items) {
      const n = normalizeItem(raw);
      if (n.ok) valid.push(n.item);
      else rejected[n.reason] += 1;
    }

    const outcomes: IngestOutcome[] = [];
    const failedDomains: string[] = [];
    for (const [domain, items] of groupByCompany(valid)) {
      try {
        const outcome = await this.upsertCompany(result, domain, items);
        outcomes.push(outcome.outcome);
        if (outcome.event) await this.publishSafely(outcome.event);
      } catch (err) {
        this.logger.error(`Ingestion failed for ${domain}: ${(err as Error).message}`);
        failedDomains.push(domain);
      }
    }
    return { outcomes, rejected, failedDomains };
  }

  private async sourceId(source: RawScrapeResult['source']): Promise<string> {
    const key = toDbSourceKey(source);
    const cached = this.sourceIds.get(key);
    if (cached) return cached;
    const row = await this.prisma.source.findUniqueOrThrow({
      where: { key: key as DbSourceKey },
      select: { id: true },
    });
    this.sourceIds.set(key, row.id);
    return row.id;
  }

  private async upsertCompany(
    result: RawScrapeResult,
    domain: string,
    items: NormalizedItem[],
  ): Promise<{ outcome: IngestOutcome; event: LeadUpsertedEvent | null }> {
    const sourceId = await this.sourceId(result.source);
    const first = items[0]!;
    const now = this.now();

    // Everything the items of this company say about it: first description wins, hints are unioned.
    const incoming = items.reduce((acc, i) => mergeEnrichment(acc, i), {
      description: null,
      techHints: [],
    } as { description: string | null; techHints: string[] });

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.company.findUnique({ where: { domain } });
      const enriched = mergeEnrichment(
        { description: before?.description ?? null, techHints: before?.techHints ?? [] },
        incoming,
      );
      const company = await tx.company.upsert({
        where: { domain },
        create: {
          domain,
          name: first.name,
          industry: first.industry,
          region: first.region,
          description: enriched.description,
          techHints: enriched.techHints,
        },
        // Enrichment only fills gaps: a missing value never erases a known one, the first name wins.
        update: {
          industry: first.industry ?? undefined,
          region: first.region ?? undefined,
          description: enriched.description ?? undefined,
          techHints: enriched.techHints,
        },
      });
      // True when this run changed a field clients can see, so the lead must be re-emitted.
      const enrichmentChanged =
        before !== null &&
        (before.industry !== company.industry ||
          before.region !== company.region ||
          before.description !== company.description ||
          before.techHints.join('\u0000') !== company.techHints.join('\u0000'));

      const created = await tx.signal.createMany({
        data: items.map((i) => ({
          companyId: company.id,
          sourceId,
          type: toDbSignal(i.signal.type),
          externalId: i.signal.externalId,
          payload: i.signal.payload as Prisma.InputJsonObject,
          detectedAt: i.signal.detectedAt,
          scrapedAt: new Date(result.scrapedAt),
        })),
        skipDuplicates: true,
      });

      const signals = await tx.signal.findMany({
        where: { companyId: company.id },
        select: { type: true, detectedAt: true, payload: true },
      });
      const score = scoreLead(
        signals.map((s) => ({
          type: fromDbSignal(s.type),
          detectedAt: s.detectedAt,
          kind: payloadKind(s.payload),
        })),
        now,
      );
      const signalTypes = [...new Set(signals.map((s) => s.type))];

      const existing = await tx.lead.findUnique({ where: { companyId: company.id } });
      const unchanged =
        existing && created.count === 0 && existing.score === score && !enrichmentChanged;
      if (unchanged) return { outcome: { domain, seq: null, newSignals: 0 }, event: null };

      const lead = await tx.lead.upsert({
        where: { companyId: company.id },
        create: {
          companyId: company.id,
          score,
          industry: company.industry,
          region: company.region,
          signalTypes,
          signalCount: signals.length,
        },
        update: {
          score,
          industry: company.industry,
          region: company.region,
          signalTypes,
          signalCount: signals.length,
        },
      });

      const ingestedAt = this.now();
      const logRow = await tx.leadEvent.create({
        data: {
          leadId: lead.id,
          payload: {},
          source: toDbSourceKey(result.source) as DbSourceKey,
          scrapedAt: new Date(result.scrapedAt),
          ingestedAt,
        },
      });
      const withSeq = await tx.lead.update({ where: { id: lead.id }, data: { seq: logRow.seq } });
      const dto = toLeadDto(withSeq, company);
      await tx.leadEvent.update({
        where: { seq: logRow.seq },
        data: { payload: dto as unknown as Prisma.InputJsonObject },
      });

      const event: LeadUpsertedEvent = {
        type: 'lead.upserted',
        seq: Number(logRow.seq),
        source: fromDbSourceKey(toDbSourceKey(result.source)),
        lead: dto,
        timings: { scrapedAt: result.scrapedAt, ingestedAt: ingestedAt.getTime() },
      };
      return { outcome: { domain, seq: event.seq, newSignals: created.count }, event };
    });
  }

  private async publishSafely(event: LeadUpsertedEvent): Promise<void> {
    try {
      await this.publisher.publish(event);
    } catch (err) {
      this.logger.warn(
        `Publish failed for seq ${event.seq} (clients will resync): ${(err as Error).message}`,
      );
    }
  }
}
