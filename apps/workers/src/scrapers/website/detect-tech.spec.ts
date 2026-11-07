import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectTech, extractMeta } from './detect-tech';

const html = (name: string): string =>
  readFileSync(join(__dirname, '../../../test/fixtures', name), 'utf8');

describe('detectTech', () => {
  it('detects the markers of the rich fixture, sorted and unique', () => {
    expect(detectTech(html('website-rich.html'), {})).toEqual([
      'Google Tag Manager',
      'HubSpot',
      'Intercom',
      'Next.js',
      'Segment',
      'Shopify',
      'WordPress',
    ]);
  });

  it('finds nothing in the tiny example.com page', () => {
    expect(detectTech(html('website-example-com.html.txt'), {})).toEqual([]);
  });

  it('uses response headers (case-insensitive names)', () => {
    expect(
      detectTech('<html></html>', { Server: 'cloudflare', 'X-Powered-By': 'Express' }),
    ).toEqual(['Cloudflare', 'Express']);
    expect(detectTech('', { server: 'nginx/1.25', 'x-powered-by': 'PHP/8.2' })).toEqual([
      'PHP',
      'nginx',
    ]);
  });

  it('detects the other documented markers', () => {
    const cases: Array<[string, string]> = [
      ['<script src="/_nuxt/entry.js"></script>', 'Nuxt'],
      ['<div data-reactroot></div>', 'React'],
      ['<div id="app" data-v-app></div>', 'Vue'],
      ['<html data-wf-site="abc" data-wf-page="def">', 'Webflow'],
      ['<img src="https://static1.squarespace.com/x.png">', 'Squarespace'],
      ['<script src="https://www.google-analytics.com/analytics.js"></script>', 'Google Analytics'],
      [
        '<script src="https://www.googletagmanager.com/gtag/js?id=G-ABC"></script>',
        'Google Analytics',
      ],
      ['<meta name="generator" content="Drupal 10">', 'Drupal'],
    ];
    for (const [markup, expected] of cases) expect(detectTech(markup, {})).toContain(expected);
  });

  it('does not report the same hint twice', () => {
    const out = detectTech(
      '<meta name="generator" content="WordPress 6"><link href="/wp-content/a.css">',
      {},
    );
    expect(out).toEqual(['WordPress']);
  });

  it('is tolerant of broken markup and empty input', () => {
    expect(detectTech('<<<script src=', {})).toEqual([]);
    expect(detectTech('', {})).toEqual([]);
  });
});

describe('extractMeta', () => {
  it('reads title, description, og:description and generator from the fixture', () => {
    expect(extractMeta(html('website-rich.html'))).toEqual({
      title: 'Acme & Co | Cloud tooling for teams',
      description: 'Acme builds cloud tooling for distributed teams.',
      ogDescription: 'Open graph description of Acme.',
      generator: 'WordPress 6.4.2',
    });
  });

  it('handles the unquoted attributes of the example.com fixture', () => {
    expect(extractMeta(html('website-example-com.html.txt'))).toEqual({
      title: 'Example Domain',
      description: null,
      ogDescription: null,
      generator: null,
    });
  });

  it('is tolerant: single quotes, case, reversed attributes, entities, whitespace', () => {
    const meta = extractMeta(
      `<HTML><TITLE>
        Caf&eacute; &#38; &#x41;
      </TITLE><META CONTENT='It&apos;s  fine' NAME='Description'><meta property=og:description content="og">`,
    );
    expect(meta.title).toBe('Caf&eacute; & A');
    expect(meta.description).toBe("It's fine");
    expect(meta.ogDescription).toBe('og');
  });

  it('ignores empty content and keeps the first occurrence', () => {
    const meta = extractMeta(
      '<meta name="description" content=""><meta name="description" content="first"><meta name="description" content="second">',
    );
    expect(meta.description).toBe('first');
  });

  it('never throws on garbage', () => {
    expect(extractMeta('<title><meta name=')).toEqual({
      title: null,
      description: null,
      ogDescription: null,
      generator: null,
    });
  });
});
