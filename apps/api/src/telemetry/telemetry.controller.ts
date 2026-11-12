import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { TelemetryService } from './telemetry.service';

/**
 * Prometheus scrape endpoint at `/metrics` (excluded from the `api` prefix in main.ts).
 * It is public because Prometheus scrapes without a token; expose it only on a private network.
 */
@Public()
@ApiExcludeController()
@Controller('metrics')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.telemetry.contentType);
    res.send(await this.telemetry.render());
  }
}
