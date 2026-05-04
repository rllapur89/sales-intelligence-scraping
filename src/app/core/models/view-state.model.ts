export type ViewState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: T; lastUpdated: Date }
  | { status: 'refreshing'; data: T }
  | { status: 'error'; error: string; retryable: boolean }
  | { status: 'empty'; message: string };
