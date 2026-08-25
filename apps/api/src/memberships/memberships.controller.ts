import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload } from '../auth/token.types';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipsService } from './memberships.service';

@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  @Roles(Role.ADMIN)
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.memberships.list(user.tenantId);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateMembershipDto,
  ) {
    return this.memberships.create(user.tenantId, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.memberships.remove(user.tenantId, id);
  }
}
