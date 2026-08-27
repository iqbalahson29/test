import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantRequestStatus } from '@prisma/client';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { CreateTenantRequestDto } from './dto/create-tenant-request.dto';
import { TenantRequestsService } from './tenant-requests.service';

@Controller('tenant-requests')
export class TenantRequestsController {
  constructor(private readonly tenantRequests: TenantRequestsService) {}

  @Post()
  create(@Body() dto: CreateTenantRequestDto) {
    return this.tenantRequests.create(dto);
  }

  // AuthGuard('jwt') here, not JwtAuthGuard — JwtAuthGuard rejects anything
  // whose payload type isn't 'access', but a super admin never holds a
  // membership so its token is 'superadmin', not 'access'.
  @Get()
  @UseGuards(AuthGuard('jwt'), SuperAdminGuard)
  list(@Query('status') status?: string) {
    if (status && !(status in TenantRequestStatus)) {
      throw new BadRequestException('Invalid status filter');
    }
    return this.tenantRequests.list(status as TenantRequestStatus | undefined);
  }

  @Post(':id/approve')
  @UseGuards(AuthGuard('jwt'), SuperAdminGuard)
  approve(@Param('id') id: string) {
    return this.tenantRequests.approve(id);
  }

  @Post(':id/reject')
  @UseGuards(AuthGuard('jwt'), SuperAdminGuard)
  reject(@Param('id') id: string) {
    return this.tenantRequests.reject(id);
  }
}
