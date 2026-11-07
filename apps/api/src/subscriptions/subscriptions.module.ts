import { Module } from '@nestjs/common';
import { SubscriptionNotifier } from './subscription-notifier';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionNotifier],
})
export class SubscriptionsModule {}
