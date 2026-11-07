import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { SUBSCRIPTIONS_CHANGED_CHANNEL } from '@leads/shared';
import { REDIS_CONNECTION } from '../queue/queue.module';

/** Tells every API instance that a user's subscriptions changed so live sockets refresh. */
@Injectable()
export class SubscriptionNotifier {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  async userChanged(userId: string): Promise<void> {
    await this.redis.publish(SUBSCRIPTIONS_CHANGED_CHANNEL, userId);
  }
}
