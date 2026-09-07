import { Module } from '@nestjs/common';
import { PracticeAnalyticsController } from './practice-analytics.controller';
import { PracticeAnalyticsService } from './practice-analytics.service';

@Module({
  controllers: [PracticeAnalyticsController],
  providers: [PracticeAnalyticsService],
})
export class PracticeAnalyticsModule {}
