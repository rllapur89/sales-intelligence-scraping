import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { AnalyticsController } from './analytics.controller';
import type { AnalyticsService } from './analytics.service';

function setup() {
  const service = {
    funnel: vi.fn().mockResolvedValue({ stages: [] }),
    bySource: vi.fn().mockResolvedValue({ items: [] }),
    byIndustry: vi.fn().mockResolvedValue({ items: [] }),
    signals: vi.fn().mockResolvedValue({ items: [] }),
    scoreTrend: vi.fn().mockResolvedValue({ days: 7, points: [] }),
  };
  return { service, controller: new AnalyticsController(service as unknown as AnalyticsService) };
}

describe('AnalyticsController', () => {
  it('delegates each route to the matching service method', async () => {
    const { service, controller } = setup();
    expect(await controller.funnel()).toEqual({ stages: [] });
    expect(await controller.bySource()).toEqual({ items: [] });
    expect(await controller.byIndustry()).toEqual({ items: [] });
    expect(await controller.signals()).toEqual({ items: [] });
    expect(service.funnel).toHaveBeenCalledTimes(1);
    expect(service.bySource).toHaveBeenCalledTimes(1);
    expect(service.byIndustry).toHaveBeenCalledTimes(1);
    expect(service.signals).toHaveBeenCalledTimes(1);
  });

  it('passes the validated days to score-trend', async () => {
    const { service, controller } = setup();
    expect(await controller.scoreTrend({ days: 7 })).toEqual({ days: 7, points: [] });
    expect(service.scoreTrend).toHaveBeenCalledWith(7);
  });

  it('is mounted under /analytics and stays behind the global auth guard', () => {
    expect(Reflect.getMetadata('path', AnalyticsController)).toBe('analytics');
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AnalyticsController)).toBeUndefined();
    for (const route of ['funnel', 'bySource', 'byIndustry', 'signals', 'scoreTrend'] as const) {
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, AnalyticsController.prototype[route]),
      ).toBeUndefined();
    }
  });

  it('exposes the five documented GET paths', () => {
    const paths = ['funnel', 'bySource', 'byIndustry', 'signals', 'scoreTrend'].map((route) =>
      Reflect.getMetadata('path', AnalyticsController.prototype[route as 'funnel']),
    );
    expect(paths).toEqual(['funnel', 'by-source', 'by-industry', 'signals', 'score-trend']);
  });
});
