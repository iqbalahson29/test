import { Module } from '@nestjs/common';
import { WorkspaceJoinRequestsController } from './workspace-join-requests.controller';
import { WorkspaceJoinRequestsService } from './workspace-join-requests.service';

@Module({
  controllers: [WorkspaceJoinRequestsController],
  providers: [WorkspaceJoinRequestsService],
})
export class WorkspaceJoinRequestsModule {}
