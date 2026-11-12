import { EntityState, createEntityAdapter } from '@ngrx/entity';
import { Lead, LeadFilter, DEFAULT_FILTER } from '../../models/lead.model';
import { RealtimeStatus } from '../../models/connection.model';

export interface LeadsState extends EntityState<Lead> {
  loading: boolean;
  error: string | null;
  filter: LeadFilter;
  selection: { mode: 'include' | 'exclude'; ids: string[] };
  selectedLeadId: string | null;
  totalCount: number;
  lastUpdated: Date | null;
  rescrapingIds: string[];
  /** Highest event sequence number applied so far; sent with `leads:resync`. */
  lastSeq: number;
  /** Socket.IO connection status (`disconnected` in mock mode). */
  connection: RealtimeStatus;
  /** Ids touched by recent live batches; rows flash until `clearChanged`. */
  changedIds: string[];
  /** True while the leads shown come from the offline cache and the REST snapshot has not replaced them yet. */
  fromCache: boolean;
}

export const leadsAdapter = createEntityAdapter<Lead>({ selectId: l => l.id });

export const initialLeadsState: LeadsState = leadsAdapter.getInitialState({
  loading: false,
  error: null,
  filter: DEFAULT_FILTER,
  selection: { mode: 'include', ids: [] },
  selectedLeadId: null,
  totalCount: 0,
  lastUpdated: null,
  rescrapingIds: [],
  lastSeq: 0,
  connection: 'disconnected' as RealtimeStatus,
  changedIds: [] as string[],
  fromCache: false,
});
