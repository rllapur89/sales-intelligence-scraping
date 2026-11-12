# ADR 0001: NestJS for the API and workers, Prisma for the database

Status: accepted

## Context

The project began as an Angular + Electron demo with mock data. It needs a REST API, a realtime gateway
and background workers that scrape public sources. The three share contracts (lead, signal and event
shapes) and one PostgreSQL schema. The author works in TypeScript on the client, so one language across
the stack keeps the contracts checkable at compile time.

## Decision

- The API (`apps/api`) and the workers (`apps/workers`) are NestJS 11 applications. The API is an HTTP
  app with a Socket.IO gateway; the workers are a standalone application context with no HTTP server
  (only a small metrics endpoint).
- The database layer is Prisma (`packages/db`) with SQL migrations committed under `prisma/migrations`.
- Shared types and constants live in `packages/shared` (`LeadDto`, `LeadUpsertedEvent`, source
  policies). Both apps and the desktop client import them.
- Pure logic (scoring, filter matching, coalescing, resync planning, robots.txt parsing) is written as
  plain functions with unit tests. Nest providers stay thin wrappers around them.

## Consequences

- Dependency injection, validation pipes, Swagger and lifecycle hooks come for free, which fits an API
  with several modules and a gateway. The price is decorators and metadata, so the TypeScript
  configuration needs `experimentalDecorators` and `emitDecoratorMetadata`.
- Prisma gives typed queries and migrations, but its enums use `UPPER_SNAKE_CASE`, so a mapping layer
  converts them to the DTO values (`apps/api/src/common/mappers.ts`). The workers need a similar
  mapping; consolidating the two is tracked in `docs/TODO.md`.
- Prisma cannot express some operations cheaply (for example the replay query by sequence range), so
  those stay as explicit, indexed queries.
- Because the workers are an application context, they cannot serve health checks through Nest HTTP;
  a plain `node:http` server exposes `/metrics`.
