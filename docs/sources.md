# Data sources

Leads are **companies with buying signals**. We never collect or store personal data (names, personal
emails, phone numbers) and never scrape LinkedIn, Apollo, ZoomInfo or similar.

Each source below was checked against its official documentation before implementation. This is an
engineering review, **not legal advice**. A source whose terms forbid this use is skipped.

Last verified: 2026-11-07 (phase 2). Sources not listed here are not implemented yet and have not been reviewed.

## Greenhouse job boards (`greenhouse`) — implemented

|                  |                                                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs             | <https://developers.greenhouse.io/job-board.html>                                                                                                                                                           |
| Endpoint         | `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs` (we do not use `?content=true`)                                                                                                         |
| Auth             | None. The docs state job board data is public; only application submission (`POST`) needs a key, and we never call it.                                                                                      |
| Documented limit | **None documented for read endpoints.**                                                                                                                                                                     |
| Our limit        | Self-imposed: 2 requests/second for the whole queue, concurrency 1. Backoff on 429/5xx, `Retry-After` respected. This is a courtesy limit, not a documented one; change it in `SOURCE_POLICIES` if needed.  |
| Attribution      | None required by the API docs.                                                                                                                                                                              |
| Terms            | The Job Board API exposes what each employer already publishes on its careers page. No clause forbidding read access to it was found in the API docs. Greenhouse's general terms were not reviewed in full. |
| What we store    | Company (domain, name, curated industry/region), and per job a `hiring` signal: job id, title, location text, `absolute_url`, `updated_at`. No applicant data; job descriptions are not stored.             |
| Company list     | `apps/workers/config/companies.json` (30 board tokens, editable). Tokens were probed live and returned HTTP 200.                                                                                            |

## Lever postings (`lever`) — implemented

|                  |                                                                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs             | <https://github.com/lever/postings-api>                                                                                                                                                                  |
| Endpoint         | `GET https://api.lever.co/v0/postings/{site}?mode=json` (EU instance: `api.eu.lever.co`, not used yet)                                                                                                   |
| Auth             | None for reading published postings.                                                                                                                                                                     |
| Documented limit | The only documented limit is for **application POSTs** (2/second, `429`). None documented for `GET`. (The 10 req/s figure on hire.lever.co applies to the authenticated Lever API, which we do not use.) |
| Our limit        | Self-imposed: 2 requests/second, concurrency 1, backoff on 429/5xx with `Retry-After`.                                                                                                                   |
| Attribution      | None required by the API docs.                                                                                                                                                                           |
| Terms            | Postings API is public and intended for embedding a company's own job list. No prohibition on reading was found in its README. General Lever terms not reviewed in full.                                 |
| What we store    | Same as Greenhouse: a `hiring` signal per posting (id, title, team/department, location text, `hostedUrl`, `createdAt`). We drop `description*`, `lists`, `additional*` text.                            |
| Company list     | Same config file (28 sites, editable). Sites were probed live and returned HTTP 200.                                                                                                                     |

## Remote OK (`remoteok`) — implemented

|                  |                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs             | <https://remoteok.com/api> (legal notice in element 0 of the response)                                                                                                                                                                                                                |
| Endpoint         | `GET https://remoteok.com/api`: JSON array, element 0 is a legal notice, jobs start at element 1. One request per run.                                                                                                                                                                |
| Auth             | None.                                                                                                                                                                                                                                                                                 |
| Documented limit | None documented. `robots.txt` has `Crawl-delay: 1` and `Disallow: /@` for AI crawlers: we never touch profile pages.                                                                                                                                                                  |
| Our limit        | Self-imposed: 1 request per 2 seconds, concurrency 1 (`SOURCE_POLICIES`). Backoff on 429/5xx, `Retry-After` respected.                                                                                                                                                                |
| User-Agent       | `leads-sales-intelligence/0.1 (+https://github.com/rllapur89/sales-intelligence-scraping)`                                                                                                                                                                                            |
| Attribution      | **Required.** Terms: "Please link back (with follow, and without nofollow!) to the URL on Remote OK and mention Remote OK as a source". Every stored signal payload carries `attribution: { name: 'Remote OK', url: <job url on remoteok.com> }`; the UI must show "via Remote OK".   |
| What we store    | A `hiring` signal per job: id, title, location, tags (max 10), salary range, job url on remoteok.com. The company domain is derived from the `apply_url`/`url` host.                                                                                                                  |
| What we avoid    | Job descriptions and company logos. Profile pages (`/@...`). Jobs without a company domain (`remoteok.com` itself, ATS/aggregator hosts such as greenhouse.io, lever.co, ashbyhq.com, workable.com, linkedin.com, indeed.com, `jobs.*`) are skipped and counted as `skippedNoDomain`. |

## GitHub REST (`github`) — implemented

|                  |                                                                                                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs             | <https://docs.github.com/en/rest> (rate limits and best practices pages)                                                                                                                                                                              |
| Endpoint         | `GET https://api.github.com/orgs/{org}/repos?type=public&sort=created&direction=desc&per_page=30` and `GET /repos/{owner}/{repo}/releases?per_page=5`                                                                                                 |
| Auth             | Token from env `GITHUB_TOKEN`, sent as `Authorization: Bearer`, with `Accept: application/vnd.github+json`. A valid `User-Agent` is required.                                                                                                         |
| Documented limit | Primary: 5,000 requests/hour authenticated (headers `x-ratelimit-limit/remaining/used/reset/resource`); when exceeded, wait until `x-ratelimit-reset` (epoch s). Secondary limit: 403/429, optional `retry-after` (s), otherwise wait >= 60 s.        |
| Our limit        | One task = one org = at most 4 sequential requests (1 repos list + releases of the 3 most recently pushed repos), spaced >= 250 ms; queue limiter 1 request per 4 seconds (`SOURCE_POLICIES`). Rate-limit errors carry `retryAfterMs`.                |
| User-Agent       | `SCRAPER_USER_AGENT` (`leads-sales-intelligence/0.1 (+https://github.com/rllapur89/sales-intelligence-scraping)`).                                                                                                                                    |
| Attribution      | None required.                                                                                                                                                                                                                                        |
| What we store    | Org-level metadata only. Repo: `name, full_name, created_at, pushed_at, language, topics, stargazers_count, html_url`. Release: `tag_name, name, published_at, prerelease, html_url`. Signals `oss-activity`: `new-repo` and `release`, last 90 days. |
| What we avoid    | Owner/author logins, emails, contributors and any other personal data (the ToS forbids selling personal data to recruiters). Company list entries need a `githubOrg` field.                                                                           |

## SEC EDGAR (`sec-edgar`) — implemented

|                  |                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs             | <https://www.sec.gov/search-filings/edgar-application-programming-interfaces> and the EDGAR fair access policy                                                                                                                                                                                                |
| Endpoints        | `GET https://www.sec.gov/files/company_tickers.json` (index -> `{cik_str, ticker, title}`; fetched once per process, cached 24 h) and `GET https://data.sec.gov/submissions/CIK{cik padded to 10 digits}.json` (`filings.recent` parallel arrays `form, filingDate, accessionNumber, primaryDocument`)        |
| Auth             | None, but every request MUST send a descriptive `User-Agent` with contact info (env `SEC_EDGAR_USER_AGENT`, for example `Company Name admin@example.com`) and `Accept-Encoding: gzip, deflate`. The source does not start without the variable.                                                               |
| Documented limit | Max 10 requests/second across all machines; exceeding it can block the IP for a while.                                                                                                                                                                                                                        |
| Our limit        | 4 requests/second, concurrency 1 (`SOURCE_POLICIES`). On 403/429 the queue backs off hard (>= 10 minutes pause).                                                                                                                                                                                              |
| Attribution      | None required.                                                                                                                                                                                                                                                                                                |
| What we store    | Signal `filing` per issuer-level form: 8-K, 10-K, 10-K/A, 10-Q, S-1, S-1/A, 424B4, 6-K, 20-F, filed in the last 90 days. Payload `{form, filingDate, url}` with the url `https://www.sec.gov/Archives/edgar/data/{cik}/{accession without dashes}/{primaryDocument}`; externalId `sec:{cik}:{accession}`.     |
| What we avoid    | Insider forms (3, 4, 5, SC 13D/G and similar): they identify people. No filing text is stored. The config field `secTicker` resolves the CIK; since tickers were not verified, a target is skipped with an error when the EDGAR `title` does not loosely match the configured name (first significant token). |

## Website enrichment (`website`) — implemented

|                  |                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Standard         | Robots Exclusion Protocol, RFC 9309 (<https://www.rfc-editor.org/rfc/rfc9309>)                                                                                                                                                                                                                                                                                           |
| Endpoint         | `GET https://{domain}/robots.txt` first, then one request to `https://{domain}/` (home page only). Targets are the domains of existing Company rows, not the config file.                                                                                                                                                                                                |
| Auth             | None.                                                                                                                                                                                                                                                                                                                                                                    |
| robots.txt rules | Group chosen by the case-insensitive product token `LeadsSalesIntelligenceBot`, else `*`, else no rules; several matching groups are merged; longest matching path wins, Allow wins ties; `*` and `$` supported. 4xx = no restrictions; 5xx or network error = assume full disallow; more than 5 redirects = unavailable, we stay out. Cached per host for at most 24 h. |
| Our limit        | 1 request per 2 seconds, concurrency 1 (`SOURCE_POLICIES`): robots.txt + home page = 2 requests per task. A published `Crawl-delay` (not part of the RFC) is honored as the minimum spacing. If `/` is disallowed the company is skipped and the reason (`robotsDisallowed`) is recorded.                                                                                |
| User-Agent       | `LeadsSalesIntelligenceBot/0.1 (+https://github.com/rllapur89/sales-intelligence-scraping)`                                                                                                                                                                                                                                                                              |
| Fetcher          | `WEBSITE_FETCHER`: plain `fetch` (default, timeout, max body 1 MB, up to 5 redirects) or `playwright` (optional `playwright-core`, loaded dynamically; Chromium is installed by the user with `npx playwright install chromium`).                                                                                                                                        |
| Attribution      | None required.                                                                                                                                                                                                                                                                                                                                                           |
| What we store    | Signal `website-tech` per company and month (externalId `web:{domain}:{yyyy-mm}`): page title, generator, `server` and `x-powered-by` headers, tech hints; company description (meta description or og:description, <= 300 chars) and `techHints`.                                                                                                                       |
| What we avoid    | Any page other than `/`, page bodies, emails, names and other personal data, sites that disallow us.                                                                                                                                                                                                                                                                     |

## Not implemented

- Hacker News 'Who is hiring' skipped by the owner's decision on 2026-11-07, terms unclear.

## Caveats

- Company `domain` and `industry`/`region` in the config are curated by hand. The domain is the company
  identity key, so a wrong value merges or splits companies.
- A slug that stops returning 200 is recorded as a failed run for that company; it does not fail the whole job.
