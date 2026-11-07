/**
 * Integration tests against real Postgres and Redis (docker compose services). Skipped unless
 * INTEGRATION_TESTS=1. Use a dedicated schema, e.g.
 *   DATABASE_URL=postgresql://leads:leads@localhost:5432/leads?schema=integration
 * then `npm run migrate:deploy -w @leads/db` once and `npm run test:integration -w @leads/workers`.
 * The tables of that schema are truncated before every test.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@leads/db';
import type { LeadUpsertedEvent, RawScrapeResult, RawSignalItem } from '@leads/shared';
import { IngestionService } from '../ingestion/ingestion.service';

const enabled = process.env['INTEGRATION_TESTS'] === '1';
const describeIf = enabled ? describe : describe.skip;

const hiring = (domain: string, id: string, name = 'Acme'): RawSignalItem => ({
  company: { name, domain, industry: 'SaaS', region: 'US' },
  signal: {
    type: 'hiring',
    externalId: id,
    detectedAt: new Date().toISOString(),
    payload: { title: 'Engineer' },
  },
});

const result = (items: RawSignalItem[], target = 'acme'): RawScrapeResult => ({
  source: 'greenhouse',
  jobId: 'job-1',
  target,
  scrapedAt: Date.now(),
  items,
});

describeIf('IngestionService (Postgres)', () => {
  const prisma = new PrismaClient();
  const events: LeadUpsertedEvent[] = [];
  const publish = vi.fn(async (e: LeadUpsertedEvent) => {
    events.push(e);
  });
  let service: IngestionService;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    // A fresh service per test: it caches the Source id, which TRUNCATE invalidates.
    service = new IngestionService(prisma, { publish });
    events.length = 0;
    publish.mockClear();
    await prisma.$executeRawUnsafe(
      'TRUNCATE "LeadEvent", "Lead", "Signal", "Company", "ScrapingJob", "Source" RESTART IDENTITY CASCADE',
    );
    await prisma.source.createMany({
      data: [
        { key: 'GREENHOUSE', name: 'Greenhouse' },
        { key: 'WEBSITE', name: 'Website' },
        { key: 'GITHUB', name: 'GitHub' },
        { key: 'SEC_EDGAR', name: 'SEC EDGAR' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates company, signals, lead and an event with a sequence number', async () => {
    const summary = await service.ingest(
      result([hiring('acme.com', 'gh:acme:1'), hiring('acme.com', 'gh:acme:2')]),
    );
    expect(summary.failedDomains).toEqual([]);
    expect(summary.outcomes).toHaveLength(1);
    expect(await prisma.company.count()).toBe(1);
    expect(await prisma.signal.count()).toBe(2);
    const lead = await prisma.lead.findFirstOrThrow();
    expect(lead.signalCount).toBe(2);
    expect(lead.score).toBeGreaterThan(0);
    expect(lead.seq).toBeGreaterThan(0n);
    expect(events).toHaveLength(1);
    expect(events[0]?.seq).toBe(Number(lead.seq));
    const logged = await prisma.leadEvent.findUniqueOrThrow({ where: { seq: lead.seq } });
    expect((logged.payload as { seq: number }).seq).toBe(Number(lead.seq));
  });

  it('is idempotent: re-ingesting the same result changes nothing and emits no event', async () => {
    const r = result([hiring('acme.com', 'gh:acme:1')]);
    await service.ingest(r);
    events.length = 0;
    const again = await service.ingest(r);
    expect(again.outcomes[0]?.seq).toBeNull();
    expect(events).toHaveLength(0);
    expect(await prisma.signal.count()).toBe(1);
    expect(await prisma.leadEvent.count()).toBe(1);
  });

  it('dedupes spellings of the same domain into one company and lead', async () => {
    await service.ingest(result([hiring('https://www.Acme.com/jobs', 'gh:acme:1')]));
    await service.ingest(result([hiring('ACME.com', 'gh:acme:2')]));
    expect(await prisma.company.count()).toBe(1);
    expect(await prisma.lead.count()).toBe(1);
    expect((await prisma.lead.findFirstOrThrow()).signalCount).toBe(2);
  });

  it('assigns strictly increasing sequence numbers', async () => {
    await service.ingest(result([hiring('a.com', 'gh:a:1', 'A')], 'a'));
    await service.ingest(result([hiring('b.com', 'gh:b:1', 'B')], 'b'));
    await service.ingest(result([hiring('a.com', 'gh:a:2', 'A')], 'a'));
    const seqs = events.map((e) => e.seq);
    expect(seqs).toHaveLength(3);
    expect([...seqs].sort((x, y) => x - y)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(3);
  });

  it('rejects items with personal data and stores nothing for them', async () => {
    const bad = hiring('acme.com', 'gh:acme:1');
    bad.signal.payload = { contact: 'jane@acme.com' };
    const summary = await service.ingest(result([bad]));
    expect(summary.rejected['personal-data']).toBe(1);
    expect(await prisma.company.count()).toBe(0);
  });

  it('keeps the committed data when publishing fails', async () => {
    publish.mockRejectedValueOnce(new Error('redis down'));
    const summary = await service.ingest(result([hiring('acme.com', 'gh:acme:1')]));
    expect(summary.failedDomains).toEqual([]);
    expect(await prisma.leadEvent.count()).toBe(1);
  });

  describe('enrichment and multi-type scoring', () => {
    const websiteResult = (
      company: Partial<RawSignalItem['company']>,
      id = 'web:acme.com:2026-07',
    ) =>
      ({
        source: 'website',
        jobId: 'job-w',
        target: 'acme.com',
        scrapedAt: Date.now(),
        items: [
          {
            company: { name: 'Acme', domain: 'acme.com', ...company },
            signal: {
              type: 'website-tech',
              externalId: id,
              detectedAt: new Date().toISOString(),
              payload: { title: 'Acme' },
            },
          },
        ],
      }) satisfies RawScrapeResult;

    it('persists description and techHints and emits them in the event', async () => {
      await service.ingest(result([hiring('acme.com', 'gh:acme:1')]));
      events.length = 0;
      await service.ingest(
        websiteResult({ description: 'We build things', techHints: ['React', 'AWS'] }),
      );
      const company = await prisma.company.findUniqueOrThrow({ where: { domain: 'acme.com' } });
      expect(company.description).toBe('We build things');
      expect(company.techHints).toEqual(['AWS', 'React']);
      expect(events).toHaveLength(1);
      expect(events[0]?.lead.company.description).toBe('We build things');
      expect(events[0]?.lead.company.techHints).toEqual(['AWS', 'React']);
    });

    it('fills description gaps only and unions techHints without erasing', async () => {
      await service.ingest(websiteResult({ description: 'First', techHints: ['React'] }));
      await service.ingest(
        websiteResult(
          { description: 'Second', techHints: ['Vue', 'React'] },
          'web:acme.com:2026-08',
        ),
      );
      await service.ingest(
        websiteResult({ description: null, techHints: [] }, 'web:acme.com:2026-09'),
      );
      const company = await prisma.company.findUniqueOrThrow({ where: { domain: 'acme.com' } });
      expect(company.description).toBe('First');
      expect(company.techHints).toEqual(['React', 'Vue']);
    });

    it('re-emits only when enrichment changed something; identical re-ingest emits nothing', async () => {
      const first = websiteResult({ description: 'Desc', techHints: ['React'] });
      await service.ingest(first);
      expect(events).toHaveLength(1);
      await service.ingest(first);
      expect(events).toHaveLength(1);
      // Same signal (deduped), but new tech hints: the lead is re-emitted with a new seq.
      const enriched = await service.ingest(
        websiteResult({ description: 'Desc', techHints: ['React', 'Next.js'] }),
      );
      expect(events).toHaveLength(2);
      expect(events[1]!.seq).toBeGreaterThan(events[0]!.seq);
      expect(enriched.outcomes[0]?.newSignals).toBe(0);
      expect(events[1]?.lead.company.techHints).toEqual(['Next.js', 'React']);
      await service.ingest(websiteResult({ techHints: ['Next.js'] }));
      expect(events).toHaveLength(2);
    });

    it('scores several signal types together (v2) and stores signal kinds', async () => {
      const now = new Date();
      await service.ingest(result([hiring('acme.com', 'gh:acme:1')]));
      const single = (await prisma.lead.findFirstOrThrow()).score;
      await service.ingest({
        source: 'sec-edgar',
        jobId: 'job-s',
        target: 'acme',
        scrapedAt: Date.now(),
        items: [
          {
            company: { name: 'Acme', domain: 'acme.com' },
            signal: {
              type: 'filing',
              externalId: 'sec:1:0001',
              detectedAt: now.toISOString(),
              payload: { form: '8-K' },
            },
          },
        ],
      });
      await service.ingest({
        source: 'github',
        jobId: 'job-g',
        target: 'acme',
        scrapedAt: Date.now(),
        items: [
          {
            company: { name: 'Acme', domain: 'acme.com' },
            signal: {
              type: 'oss-activity',
              externalId: 'gh:acme:repo:acme/x',
              detectedAt: now.toISOString(),
              payload: { kind: 'new-repo' },
            },
          },
        ],
      });
      const lead = await prisma.lead.findFirstOrThrow();
      // hiring 15 + filing 25 + new-repo 8 + 2 extra types * 10
      expect(single).toBe(15);
      expect(lead.score).toBe(68);
      expect(lead.signalTypes.sort()).toEqual(['FILING', 'HIRING', 'OSS_ACTIVITY']);
    });
  });
});
