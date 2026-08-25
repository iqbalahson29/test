import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { GradingController } from './grading.controller';
import { GradingService } from './grading.service';

@Module({
  imports: [StorageModule],
  controllers: [GradingController],
  providers: [GradingService],
  exports: [GradingService],
})
export class GradingModule {}
