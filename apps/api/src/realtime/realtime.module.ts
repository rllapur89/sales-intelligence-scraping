import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { LiveHub } from './live-hub';
import { RealtimeGateway } from './realtime.gateway';
import { ResyncService } from './resync.service';

@Module({
  imports: [NotificationsModule],
  providers: [LiveHub, ResyncService, RealtimeGateway],
})
export class RealtimeModule {}
