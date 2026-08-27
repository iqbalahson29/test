import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload } from '../auth/token.types';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.groups.list(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateGroupDto) {
    return this.groups.create(user.tenantId, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.groups.findOne(user.tenantId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.groups.remove(user.tenantId, id);
  }

  @Post(':id/members')
  addMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: AddGroupMemberDto,
  ) {
    return this.groups.addMember(user.tenantId, id, dto);
  }

  @Delete(':id/members/:membershipId')
  removeMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.groups.removeMember(user.tenantId, id, membershipId);
  }
}
