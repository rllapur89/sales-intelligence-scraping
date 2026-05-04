import { ApplicationConfig, provideZonelessChangeDetection, isDevMode } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { leadsReducer } from './core/store/leads/leads.reducer';
import { scrapingReducer } from './core/store/scraping/scraping.reducer';
import { LeadsEffects } from './core/store/leads/leads.effects';
import { ScrapingEffects } from './core/store/scraping/scraping.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(),
    provideStore({
      leads: leadsReducer,
      scraping: scrapingReducer,
    }),
    provideEffects([LeadsEffects, ScrapingEffects]),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
  ],
};
