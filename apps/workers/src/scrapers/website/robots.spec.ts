import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../http/http-client';
import { isPathAllowed, parseRobots, policyFromStatus, RobotsChecker, selectRules } from './robots';
import { TooManyRedirectsError, type FetchedPage, type PageFetcher } from './page-fetcher';

const rulesFor = (text: string) => selectRules(parseRobots(text));
const allowed = (text: string, path: string): boolean => isPathAllowed(rulesFor(text).rules, path);

describe('group selection', () => {
  it('prefers the product token group (case-insensitive) over *', () => {
    const txt = `User-agent: *\nDisallow: /\n\nUser-agent: leadssalesintelligencebot\nAllow: /\n`;
    expect(allowed(txt, '/')).toBe(true);
  });

  it('falls back to * when no group names us', () => {
    const txt = `User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nDisallow: /private\n`;
    expect(allowed(txt, '/private/x')).toBe(false);
    expect(allowed(txt, '/public')).toBe(true);
  });

  it('has no rules when neither we nor * are named', () => {
    expect(allowed(`User-agent: Googlebot\nDisallow: /\n`, '/')).toBe(true);
  });

  it('merges several groups that name us', () => {
    const txt = [
      'User-agent: LeadsSalesIntelligenceBot',
      'Disallow: /a',
      '',
      'User-agent: Other',
      'Disallow: /other',
      '',
      'User-agent: LeadsSalesIntelligenceBot',
      'Disallow: /b',
    ].join('\n');
    expect(allowed(txt, '/a')).toBe(false);
    expect(allowed(txt, '/b')).toBe(false);
    expect(allowed(txt, '/other')).toBe(true);
  });

  it('shares one group among consecutive User-agent lines', () => {
    const txt = `User-agent: Other\nUser-agent: LeadsSalesIntelligenceBot\nDisallow: /x\n`;
    expect(allowed(txt, '/x')).toBe(false);
  });

  it('merges multiple * groups and ignores comments, BOM and CRLF', () => {
    const txt = `\uFEFFUser-agent: * # everyone\r\nDisallow: /a # no\r\n\r\nUser-agent: *\r\nDisallow: /b\r\n`;
    expect(allowed(txt, '/a')).toBe(false);
    expect(allowed(txt, '/b')).toBe(false);
  });
});

describe('path matching', () => {
  it('the longest matching rule wins', () => {
    const txt = `User-agent: *\nDisallow: /shop\nAllow: /shop/public\n`;
    expect(allowed(txt, '/shop/private')).toBe(false);
    expect(allowed(txt, '/shop/public/item')).toBe(true);
  });

  it('Allow wins a tie', () => {
    const txt = `User-agent: *\nDisallow: /page\nAllow: /page\n`;
    expect(allowed(txt, '/page')).toBe(true);
    const reversed = `User-agent: *\nAllow: /page\nDisallow: /page\n`;
    expect(allowed(reversed, '/page')).toBe(true);
  });

  it('an empty Disallow allows everything', () => {
    expect(allowed(`User-agent: *\nDisallow:\n`, '/anything')).toBe(true);
  });

  it('Disallow: / blocks the home page and everything else', () => {
    const txt = `User-agent: *\nDisallow: /\n`;
    expect(allowed(txt, '/')).toBe(false);
    expect(allowed(txt, '/a')).toBe(false);
    expect(allowed(txt, '/robots.txt')).toBe(true);
  });

  it('supports * wildcards and $ anchors', () => {
    const txt = `User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp*/cache\nAllow: /tmp-ok/cache\n`;
    expect(allowed(txt, '/docs/a.pdf')).toBe(false);
    expect(allowed(txt, '/docs/a.pdf?x=1')).toBe(true);
    expect(allowed(txt, '/docs/a.pdfx')).toBe(true);
    expect(allowed(txt, '/tmp1/cache')).toBe(false);
    expect(allowed(txt, '/tmp-ok/cache')).toBe(true);
  });

  it('matches by prefix and is case-sensitive on the path', () => {
    const txt = `User-agent: *\nDisallow: /Admin\n`;
    expect(allowed(txt, '/Admin/users')).toBe(false);
    expect(allowed(txt, '/admin/users')).toBe(true);
  });

  it('treats regex characters in paths literally', () => {
    const txt = `User-agent: *\nDisallow: /a.b(c)+\n`;
    expect(allowed(txt, '/a.b(c)+')).toBe(false);
    expect(allowed(txt, '/aXb(c)+')).toBe(true);
  });

  it('ignores rules that appear before any User-agent line', () => {
    expect(allowed(`Disallow: /\nUser-agent: *\nAllow: /\n`, '/')).toBe(true);
  });
});

describe('crawl-delay', () => {
  it('extracts the delay of the selected group', () => {
    const txt = `User-agent: *\nCrawl-delay: 1\n\nUser-agent: LeadsSalesIntelligenceBot\nCrawl-delay: 7.5\nDisallow: /x\n`;
    expect(rulesFor(txt).crawlDelaySec).toBe(7.5);
    expect(rulesFor(`User-agent: *\nCrawl-delay: 1\n`).crawlDelaySec).toBe(1);
  });

  it('is undefined when absent or invalid', () => {
    expect(rulesFor(`User-agent: *\nDisallow: /x\n`).crawlDelaySec).toBeUndefined();
    expect(rulesFor(`User-agent: *\nCrawl-delay: soon\n`).crawlDelaySec).toBeUndefined();
  });
});

describe('policyFromStatus', () => {
  it('parses a 200 body', () => {
    const p = policyFromStatus(200, 'User-agent: *\nDisallow: /');
    expect(p.kind).toBe('rules');
    expect(isPathAllowed(p.rules, '/')).toBe(false);
  });
  it('treats 4xx as no restrictions', () => {
    for (const status of [401, 403, 404, 410, 429]) {
      const p = policyFromStatus(status, 'User-agent: *\nDisallow: /');
      expect(p.kind).toBe('allow-all');
    }
  });
  it('treats 5xx as full disallow', () => {
    for (const status of [500, 502, 503]) {
      expect(policyFromStatus(status, '').kind).toBe('disallow-all');
    }
  });
});

function page(status: number, body = ''): FetchedPage {
  return { status, headers: {}, body, finalUrl: 'https://x/robots.txt' };
}

function checkerWith(fetchPage: PageFetcher['fetchPage'], now: () => number = () => 0) {
  const fetcher = { fetchPage: vi.fn(fetchPage) };
  return { fetcher, checker: new RobotsChecker({ fetcher, now }) };
}

describe('RobotsChecker', () => {
  it('requests https://{host}/robots.txt and applies the rules', async () => {
    const { checker, fetcher } = checkerWith(async () =>
      page(200, 'User-agent: *\nDisallow: /private\n'),
    );
    expect(await checker.isAllowed('Example.com', '/')).toBe(true);
    expect(await checker.isAllowed('example.com', '/private/a')).toBe(false);
    expect(fetcher.fetchPage).toHaveBeenCalledTimes(1);
    expect(fetcher.fetchPage).toHaveBeenCalledWith('https://example.com/robots.txt');
  });

  it('allows everything on 404', async () => {
    const { checker } = checkerWith(async () => page(404));
    expect(await checker.isAllowed('a.com', '/x')).toBe(true);
  });

  it('assumes full disallow on 503', async () => {
    const { checker } = checkerWith(async () => page(503));
    expect(await checker.isAllowed('a.com', '/')).toBe(false);
    expect((await checker.getPolicy('a.com')).reason).toContain('503');
  });

  it('assumes full disallow on network errors', async () => {
    const { checker } = checkerWith(async () => {
      throw new HttpError('Network error', 0);
    });
    const policy = await checker.getPolicy('a.com');
    expect(policy.kind).toBe('disallow-all');
    expect(policy.reason).toContain('unreachable');
  });

  it('treats more than 5 redirects as unavailable and stays out', async () => {
    const { checker } = checkerWith(async (url) => {
      throw new TooManyRedirectsError(url);
    });
    const policy = await checker.getPolicy('a.com');
    expect(policy.kind).toBe('disallow-all');
    expect(policy.reason).toContain('too many redirects');
  });

  it('caches per host for 24 h with an injectable clock', async () => {
    let t = 1_000;
    const { checker, fetcher } = checkerWith(
      async () => page(200, 'User-agent: *\nAllow: /'),
      () => t,
    );
    await checker.getPolicy('a.com');
    await checker.getPolicy('A.com');
    await checker.getPolicy('b.com');
    expect(fetcher.fetchPage).toHaveBeenCalledTimes(2);
    t += 24 * 3_600_000 - 1;
    await checker.getPolicy('a.com');
    expect(fetcher.fetchPage).toHaveBeenCalledTimes(2);
    t += 2;
    await checker.getPolicy('a.com');
    expect(fetcher.fetchPage).toHaveBeenCalledTimes(3);
  });

  it('exposes crawl-delay through the policy', async () => {
    const { checker } = checkerWith(async () => page(200, 'User-agent: *\nCrawl-delay: 3\n'));
    expect((await checker.getPolicy('a.com')).crawlDelaySec).toBe(3);
  });
});
