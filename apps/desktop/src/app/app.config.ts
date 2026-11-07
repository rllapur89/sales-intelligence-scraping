import { ApplicationConfig, provideZonelessChangeDetection, isDevMode } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { leadsReducer } from './core/store/leads/leads.reducer';
import { scrapingReducer } from './core/store/scraping/scraping.reducer';
import { LeadsEffects } from './core/store/leads/leads.effects';
import { ScrapingEffects } from './core/store/scraping/scraping.effects';
import { authInterceptor } from './core/auth/auth.interceptor';
import { provideDataSources } from './core/data/data-sources.provider';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Mock generators or REST implementations, picked by environment.dataMode
    ...provideDataSources(environment.dataMode),
    provideStore({
      leads: leadsReducer,
      scraping: scrapingReducer,
    }),
    provideEffects([LeadsEffects, ScrapingEffects]),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
  ],
};
