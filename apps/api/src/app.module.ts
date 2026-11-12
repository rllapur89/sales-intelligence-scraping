import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { LeadsModule } from './leads/leads.module';
import { MetricsModule } from './metrics/metrics.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: (raw) => ({ ...raw, ...validateEnv(raw) }),
    }),
    PrismaModule,
    QueueModule,
    AuthModule,
    LeadsModule,
    JobsModule,
    MetricsModule,
    AnalyticsModule,
    SubscriptionsModule,
    TelemetryModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
