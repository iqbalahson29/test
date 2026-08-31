import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { JoinByCodeDto } from './dto/join-by-code.dto';
import { SetJoinCodeDto } from './dto/set-join-code.dto';
import { UpdateTenantProfileDto } from './dto/update-tenant-profile.dto';
import { WorkspaceJoinRequestsService } from './workspace-join-requests.service';

@Controller('workspace-join-requests')
export class WorkspaceJoinRequestsController {
  constructor(private readonly joinRequests: WorkspaceJoinRequestsService) {}

  // No guard — looked up from a shareable invite link (/join/:slug) before
  // the visitor has necessarily signed in at all.
  @Get('by-slug/:slug')
  bySlug(@Param('slug') slug: string) {
    return this.joinRequests.findBySlug(slug);
  }

  // The admin's own workspace slug, for rendering their invite link on the
  // members page.
  @Get('my-tenant')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  myTenant(@CurrentUser() user: AccessTokenPayload) {
    return this.joinRequests.getOwnTenant(user.tenantId);
  }

  // Lets the workspace's own admin edit the description/banner shown on the
  // public landing page (/join/:slug) and in the student directory.
  @Patch('my-tenant')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateMyTenant(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateTenantProfileDto,
  ) {
    return this.joinRequests.updateOwnTenant(user.tenantId, user.membershipId, dto);
  }

  // Lets the admin set a custom join code students can use to join
  // instantly, without waiting for approval.
  @Patch('my-tenant/join-code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  setJoinCode(@CurrentUser() user: AccessTokenPayload, @Body() dto: SetJoinCodeDto) {
    return this.joinRequests.setJoinCode(user.tenantId, user.membershipId, dto);
  }

  @Post('my-tenant/join-code/generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  generateJoinCode(@CurrentUser() user: AccessTokenPayload) {
    return this.joinRequests.generateJoinCode(user.tenantId, user.membershipId);
  }

  @Delete('my-tenant/join-code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  clearJoinCode(@CurrentUser() user: AccessTokenPayload) {
    return this.joinRequests.clearJoinCode(user.tenantId, user.membershipId);
  }

  // Bare AuthGuard('jwt') on these four — any authenticated identity can
  // browse workspaces and request to join, including 'account' tokens
  // (0-membership accounts) and already-active students alike.
  @Get('directory')
  @UseGuards(AuthGuard('jwt'))
  directory(@Req() req: Request & { user: AnyTokenPayload }) {
    return this.joinRequests.directory(req.user.sub);
  }

  // A join code grants membership immediately — no admin approval step,
  // since knowing the code is itself the authorization.
  @Post('join-by-code')
  @UseGuards(AuthGuard('jwt'))
  joinByCode(
    @Req() req: Request & { user: AnyTokenPayload },
    @Body() dto: JoinByCodeDto,
  ) {
    return this.joinRequests.joinByCode(req.user.sub, dto);
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
    return this.joinRequests.approve(user.tenantId, id, user.membershipId);
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  reject(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.joinRequests.reject(user.tenantId, id, user.membershipId);
  }
}
