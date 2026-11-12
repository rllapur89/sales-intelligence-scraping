import { describe, expect, it, vi } from 'vitest';
import type { SubscriptionFilter } from '@leads/shared';
import {
  cleanupUsers,
  EMAIL_DOMAIN,
  EMAIL_PREFIX,
  emailFor,
  PASSWORD,
  provisionUsers,
  type UserStore,
} from './provision';

const filter: SubscriptionFilter = {
  industries: ['SaaS'],
  regions: [],
  signalTypes: ['hiring'],
  minScore: 10,
};

function makeStore(): UserStore {
  return {
    ensureUsers: vi.fn().mockResolvedValue(undefined),
    deleteByEmailPrefix: vi.fn().mockResolvedValue(2),
  };
}

function okFetch() {
  return vi.fn().mockImplementation((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(url.endsWith('/auth/login') ? { accessToken: `tok-${url.length}` } : {}),
    }),
  );
}

describe('emailFor', () => {
  it('uses the reserved .invalid domain so it can never reach a real person', () => {
    expect(emailFor(3)).toBe(`${EMAIL_PREFIX}3@${EMAIL_DOMAIN}`);
    expect(EMAIL_DOMAIN.endsWith('.invalid')).toBe(true);
  });
});

describe('provisionUsers', () => {
  it('cleans leftovers, creates the users, then logs in and subscribes each one', async () => {
    const store = makeStore();
    const doFetch = okFetch();
    const users = await provisionUsers({ apiUrl: 'http://api', store, fetch: doFetch }, [
      filter,
      filter,
    ]);

    expect(store.deleteByEmailPrefix).toHaveBeenCalledWith(EMAIL_PREFIX);
    expect(store.ensureUsers).toHaveBeenCalledWith([emailFor(0), emailFor(1)], PASSWORD);
    expect(users.map((u) => u.email)).toEqual([emailFor(0), emailFor(1)]);
    expect(doFetch).toHaveBeenCalledTimes(4);

    const [loginUrl, loginInit] = doFetch.mock.calls[0] as [string, { body: string }];
    expect(loginUrl).toBe('http://api/api/auth/login');
    expect(JSON.parse(loginInit.body)).toEqual({ email: emailFor(0), password: PASSWORD });
  });

  it('sends the filter and the bearer token when subscribing', async () => {
    const doFetch = okFetch();
    await provisionUsers({ apiUrl: 'http://api', store: makeStore(), fetch: doFetch }, [filter]);
    const [url, init] = doFetch.mock.calls[1] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('http://api/api/subscriptions');
    expect(init.headers['Authorization']).toMatch(/^Bearer tok-/);
    expect(JSON.parse(init.body)).toMatchObject({ active: true, ...filter });
  });

  it('fails loudly when the API rejects a request', async () => {
    const doFetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => ({}) });
    await expect(
      provisionUsers({ apiUrl: 'http://api', store: makeStore(), fetch: doFetch }, [filter]),
    ).rejects.toThrow('HTTP 401');
  });
});

describe('cleanupUsers', () => {
  it('deletes by prefix and returns how many were removed', async () => {
    const store = makeStore();
    expect(await cleanupUsers(store)).toBe(2);
    expect(store.deleteByEmailPrefix).toHaveBeenCalledWith(EMAIL_PREFIX);
  });
});
