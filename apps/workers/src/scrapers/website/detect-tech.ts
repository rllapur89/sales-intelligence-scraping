export interface PageMeta {
  title: string | null;
  description: string | null;
  ogDescription: string | null;
  generator: string | null;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function clean(value: string | undefined): string | null {
  if (value === undefined) return null;
  const v = decodeEntities(value).replace(/\s+/g, ' ').trim();
  return v === '' ? null : v;
}

/** Attributes of one tag body (tolerates unquoted, single-quoted and valueless attributes). */
function parseAttributes(tagBody: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const m of tagBody.matchAll(re)) {
    const name = (m[1] ?? '').toLowerCase();
    if (name !== '' && !(name in attrs)) attrs[name] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

function* tags(html: string, name: string): Generator<Record<string, string>> {
  const re = new RegExp(`<${name}(?=[\\s/>])([^>]*)>`, 'gi');
  for (const m of html.matchAll(re)) yield parseAttributes(m[1] ?? '');
}

/** Title, description, og:description and generator of an HTML document. Never throws. */
export function extractMeta(html: string): PageMeta {
  const meta: PageMeta = { title: null, description: null, ogDescription: null, generator: null };
  const title = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i.exec(html);
  meta.title = clean(title?.[1]);
  for (const attrs of tags(html, 'meta')) {
    const key = (attrs['name'] ?? attrs['property'] ?? '').toLowerCase();
    const content = clean(attrs['content']);
    if (content === null) continue;
    if (key === 'description' && meta.description === null) meta.description = content;
    else if (key === 'og:description' && meta.ogDescription === null) meta.ogDescription = content;
    else if (key === 'generator' && meta.generator === null) meta.generator = content;
  }
  return meta;
}

const HTML_MARKERS: ReadonlyArray<readonly [string, RegExp]> = [
  ['WordPress', /\/wp-content\/|\/wp-includes\//i],
  ['Shopify', /cdn\.shopify\.com/i],
  ['Next.js', /__NEXT_DATA__|\/_next\//],
  ['Nuxt', /__NUXT__|\/_nuxt\//],
  ['React', /data-reactroot|react(?:-dom)?(?:\.production)?(?:\.min)?\.js|__REACT_DEVTOOLS/i],
  ['Vue', /\bdata-v-app\b|\bdata-v-[0-9a-f]{6,}|vue(?:\.runtime)?(?:\.global)?(?:\.min)?\.js/i],
  ['Webflow', /webflow\.com|data-wf-(?:page|site)/i],
  ['Squarespace', /squarespace\.com|static1\.squarespace/i],
  ['HubSpot', /js\.hs-scripts\.com|js\.hsforms\.net|js\.hs-analytics\.net/i],
  ['Segment', /cdn\.segment\.com/i],
  ['Google Analytics', /google-analytics\.com\/|gtag\/js\?id=G-|gtag\/js\?id=UA-/i],
  ['Google Tag Manager', /googletagmanager\.com\/gtm\.js/i],
  ['Intercom', /widget\.intercom\.io|intercomcdn\.com|window\.Intercom/i],
  ['Wix', /static\.parastorage\.com|wixstatic\.com/i],
  ['Gatsby', /___gatsby/],
];

const GENERATORS: ReadonlyArray<readonly [string, RegExp]> = [
  ['WordPress', /wordpress/i],
  ['Wix', /\bwix\b/i],
  ['Drupal', /drupal/i],
  ['Joomla', /joomla/i],
  ['Ghost', /\bghost\b/i],
  ['Shopify', /shopify/i],
  ['Webflow', /webflow/i],
  ['Squarespace', /squarespace/i],
  ['Gatsby', /gatsby/i],
  ['Hugo', /\bhugo\b/i],
  ['Next.js', /next\.js/i],
  ['Nuxt', /nuxt/i],
];

const SERVER_HINTS: ReadonlyArray<readonly [string, RegExp]> = [
  ['Cloudflare', /cloudflare/i],
  ['nginx', /nginx/i],
  ['Apache', /apache/i],
  ['Vercel', /vercel/i],
  ['Netlify', /netlify/i],
  ['Microsoft IIS', /microsoft-iis|\biis\b/i],
];

const POWERED_BY_HINTS: ReadonlyArray<readonly [string, RegExp]> = [
  ['Next.js', /next\.js/i],
  ['Express', /express/i],
  ['PHP', /php/i],
  ['ASP.NET', /asp\.net/i],
  ['WordPress', /wordpress/i],
  ['Shopify', /shopify/i],
];

function header(headers: Record<string, string>, name: string): string {
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === name) return v;
  return '';
}

/** Technology hints from page markup and response headers: sorted, unique, never throws. */
export function detectTech(html: string, headers: Record<string, string> = {}): string[] {
  const found = new Set<string>();
  for (const [name, re] of HTML_MARKERS) if (re.test(html)) found.add(name);

  const generator = extractMeta(html).generator;
  if (generator) for (const [name, re] of GENERATORS) if (re.test(generator)) found.add(name);

  const server = header(headers, 'server');
  if (server) for (const [name, re] of SERVER_HINTS) if (re.test(server)) found.add(name);
  const poweredBy = header(headers, 'x-powered-by');
  if (poweredBy) for (const [name, re] of POWERED_BY_HINTS) if (re.test(poweredBy)) found.add(name);
  return [...found].sort();
}
