# Architecture decision records

Each record states the context, the decision and what it costs. Newer records can supersede older ones;
nothing is deleted.

| ADR                                           | Decision                                                 |
| --------------------------------------------- | -------------------------------------------------------- |
| [0001](./0001-nestjs-and-prisma.md)           | NestJS for the API and workers, Prisma for the database  |
| [0002](./0002-bullmq-queue-per-source.md)     | One BullMQ queue and limiter per data source             |
| [0003](./0003-socketio-with-redis-adapter.md) | Socket.IO with the Redis adapter for live updates        |
| [0004](./0004-sequence-numbers-and-resync.md) | Sequence numbers, coalescing and delta resync            |
| [0005](./0005-lead-retraction.md)             | Retract leads that stop matching, bounded per-socket set |

Format: Status, Context, Decision, Consequences.
