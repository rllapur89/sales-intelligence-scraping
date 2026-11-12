import { Provider } from '@angular/core';
import type { DataMode } from '../../../environments/environment.model';
import { LeadsDataSource, LiveLeadsDataSource, MockLeadsDataSource } from './leads.data-source';
import { JobsDataSource, LiveJobsDataSource, MockJobsDataSource } from './jobs.data-source';
import {
  LiveSubscriptionsDataSource,
  MockSubscriptionsDataSource,
  SubscriptionsDataSource,
} from './subscriptions.data-source';
import {
  AnalyticsDataSource,
  LiveAnalyticsDataSource,
  MockAnalyticsDataSource,
} from './analytics.data-source';
import { CrmDataSource, LiveCrmDataSource, MockCrmDataSource } from './crm.data-source';
import {
  LiveNotificationsDataSource,
  MockNotificationsDataSource,
  NotificationsDataSource,
} from './notifications.data-source';
import {
  LiveMetricsDataSource,
  MetricsDataSource,
  MockMetricsDataSource,
} from './metrics.data-source';

/** Picks the mock or the REST implementation of every data source from `dataMode`. */
export function provideDataSources(mode: DataMode): Provider[] {
  const live = mode === 'live';
  return [
    { provide: LeadsDataSource, useClass: live ? LiveLeadsDataSource : MockLeadsDataSource },
    { provide: JobsDataSource, useClass: live ? LiveJobsDataSource : MockJobsDataSource },
    {
      provide: SubscriptionsDataSource,
      useClass: live ? LiveSubscriptionsDataSource : MockSubscriptionsDataSource,
    },
    { provide: MetricsDataSource, useClass: live ? LiveMetricsDataSource : MockMetricsDataSource },
    {
      provide: AnalyticsDataSource,
      useClass: live ? LiveAnalyticsDataSource : MockAnalyticsDataSource,
    },
    { provide: CrmDataSource, useClass: live ? LiveCrmDataSource : MockCrmDataSource },
    {
      provide: NotificationsDataSource,
      useClass: live ? LiveNotificationsDataSource : MockNotificationsDataSource,
    },
  ];
}
