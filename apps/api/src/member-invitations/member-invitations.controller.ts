import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload } from '../auth/token.types';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { BulkCreateInvitationsDto } from './dto/bulk-create-invitations.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { MemberInvitationsService } from './member-invitations.service';

@Controller('member-invitations')
export class MemberInvitationsController {
  constructor(private readonly invitations: MemberInvitationsService) {}

  // No guard — the invitee hasn't signed in yet when they open the link.
  @Get('by-token/:token')
  byToken(@Param('token') token: string) {
    return this.invitations.findByToken(token);
  }

  @Post(':token/accept')
  @HttpCode(HttpStatus.CREATED)
  accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(token, dto.name, dto.password);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.invitations.list(user.tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateInvitationDto) {
    return this.invitations.create(user.tenantId, dto, user.membershipId);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  bulkCreate(@CurrentUser() user: AccessTokenPayload, @Body() dto: BulkCreateInvitationsDto) {
    return this.invitations.bulkCreate(user.tenantId, dto.entries, user.membershipId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  revoke(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.invitations.revoke(user.tenantId, id, user.membershipId);
  }
}
