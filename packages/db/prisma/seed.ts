import { PrismaClient, type SourceKey, UserRole } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

/** Rate limits are placeholders until each source's terms are verified (phase 2+, docs/sources.md). */
const SOURCES: { key: SourceKey; name: string }[] = [
  { key: 'GREENHOUSE', name: 'Greenhouse job boards' },
  { key: 'LEVER', name: 'Lever postings' },
  { key: 'HN_HIRING', name: 'Hacker News: Who is hiring' },
  { key: 'REMOTEOK', name: 'RemoteOK' },
  { key: 'GITHUB', name: 'GitHub organizations' },
  { key: 'SEC_EDGAR', name: 'SEC EDGAR filings' },
  { key: 'WEBSITE', name: 'Company website enrichment' },
];

async function main(): Promise<void> {
  for (const s of SOURCES) {
    await prisma.source.upsert({ where: { key: s.key }, update: {}, create: s });
  }

  const demoPassword = process.env['DEMO_USER_PASSWORD'] ?? 'demo1234';
  const users = [
    { email: 'admin@demo.local', displayName: 'Demo Admin', role: UserRole.ADMIN },
    { email: 'sales@demo.local', displayName: 'Demo Sales', role: UserRole.USER },
  ];
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash: hashSync(demoPassword, 10) },
    });
    // Idempotent: a user with no active subscription receives nothing live.
    const existing = await prisma.subscription.findFirst({
      where: { userId: user.id, name: 'All leads' },
    });
    if (!existing) {
      await prisma.subscription.create({
        data: { userId: user.id, name: 'All leads', active: true, minScore: 0 },
      });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
