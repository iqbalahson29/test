import { Module } from '@nestjs/common';
import { PracticeGradingModule } from '../practice-grading/practice-grading.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { PracticeAttemptsController } from './practice-attempts.controller';
import { PracticeAttemptsService } from './practice-attempts.service';

@Module({
  imports: [PracticeGradingModule, StorageModule, NotificationsModule],
  controllers: [PracticeAttemptsController],
  providers: [PracticeAttemptsService],
})
export class PracticeAttemptsModule {}
