import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload, AnyTokenPayload } from '../auth/token.types';
import { CreateJoinRequestDto } from './dto/create-join-request.dto';
import { WorkspaceJoinRequestsService } from './workspace-join-requests.service';

@Controller('workspace-join-requests')
export class WorkspaceJoinRequestsController {
  constructor(private readonly joinRequests: WorkspaceJoinRequestsService) {}

  // Bare AuthGuard('jwt') on these three — any authenticated identity can
  // browse workspaces and request to join, including 'account' tokens
  // (0-membership accounts) and already-active students alike.
  @Get('directory')
  @UseGuards(AuthGuard('jwt'))
  directory(@Req() req: Request & { user: AnyTokenPayload }) {
    return this.joinRequests.directory(req.user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard('jwt'))
  create(
    @Req() req: Request & { user: AnyTokenPayload },
    @Body() dto: CreateJoinRequestDto,
  ) {
    return this.joinRequests.create(req.user.sub, dto.tenantId);
  }

  @Get('mine')
  @UseGuards(AuthGuard('jwt'))
  mine(@Req() req: Request & { user: AnyTokenPayload }) {
    return this.joinRequests.mine(req.user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  cancel(@Req() req: Request & { user: AnyTokenPayload }, @Param('id') id: string) {
    return this.joinRequests.cancel(req.user.sub, id);
  }

  // Full 'access' + ADMIN required from here on — tenant-scoped review.
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listPending(@CurrentUser() user: AccessTokenPayload) {
    return this.joinRequests.listPendingForTenant(user.tenantId);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  approve(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.joinRequests.approve(user.tenantId, id);
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  reject(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.joinRequests.reject(user.tenantId, id);
  }
}
