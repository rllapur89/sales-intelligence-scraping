import type { AuthResponse, SubscriptionFilter } from '@leads/shared';

export const EMAIL_DOMAIN = 'loadtest.invalid';
export const EMAIL_PREFIX = 'loadtest-user-';
export const PASSWORD = 'loadtest-password';

export function emailFor(index: number): string {
  return `${EMAIL_PREFIX}${index}@${EMAIL_DOMAIN}`;
}

/** The slice of the database the provisioner needs; implemented with Prisma in `run.ts`. */
export interface UserStore {
  /** Inserts users that do not exist yet (idempotent by email). */
  ensureUsers(emails: readonly string[], password: string): Promise<void>;
  /** Deletes every user whose email starts with `prefix` (subscriptions cascade). */
  deleteByEmailPrefix(prefix: string): Promise<number>;
}

export interface ProvisionedUser {
  email: string;
  token: string;
  filter: SubscriptionFilter;
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ProvisionDeps {
  apiUrl: string;
  store: UserStore;
  fetch?: FetchLike;
}

async function postJson<T>(
  doFetch: FetchLike,
  url: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${url} failed with HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Creates one user per profile, logs each in, and gives it exactly one subscription through the
 * public REST API (so the real validation and the real cache invalidation path are exercised).
 * Logins run sequentially: each one costs a bcrypt compare on the API.
 */
export async function provisionUsers(
  deps: ProvisionDeps,
  profiles: readonly SubscriptionFilter[],
): Promise<ProvisionedUser[]> {
  const doFetch: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));
  const emails = profiles.map((_, i) => emailFor(i));
  // Start clean: a leftover user from a crashed run could carry old subscriptions.
  await deps.store.deleteByEmailPrefix(EMAIL_PREFIX);
  await deps.store.ensureUsers(emails, PASSWORD);

  const users: ProvisionedUser[] = [];
  for (const [i, filter] of profiles.entries()) {
    const email = emails[i] as string;
    const auth = await postJson<AuthResponse>(doFetch, `${deps.apiUrl}/api/auth/login`, {
      email,
      password: PASSWORD,
    });
    await postJson(
      doFetch,
      `${deps.apiUrl}/api/subscriptions`,
      { name: `loadtest ${i}`, active: true, ...filter },
      auth.accessToken,
    );
    users.push({ email, token: auth.accessToken, filter });
  }
  return users;
}

export async function cleanupUsers(store: UserStore): Promise<number> {
  return store.deleteByEmailPrefix(EMAIL_PREFIX);
}
