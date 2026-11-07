import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkersModule } from './workers.module';

/** Standalone Nest app: no HTTP server. hosts one BullMQ worker per reviewed source plus ingestion. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkersModule);
  app.enableShutdownHooks();
  Logger.log('Workers ready', 'Bootstrap');
}

void bootstrap();
