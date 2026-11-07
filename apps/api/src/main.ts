import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Express 5 defaults to the simple parser; filters like `industry[]=a` need the extended one.
  app.set('query parser', 'extended');
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const corsOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:4200';
  app.enableCors({ origin: corsOrigin });
  const ioAdapter = new RedisIoAdapter(
    app,
    process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    corsOrigin,
  );
  ioAdapter.connect();
  app.useWebSocketAdapter(ioAdapter);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Sales Intelligence API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, doc);

  const port = Number(process.env['API_PORT'] ?? 3000);
  await app.listen(port);
  Logger.log(`API listening on :${port} (OpenAPI at /docs)`, 'Bootstrap');
}

void bootstrap();
