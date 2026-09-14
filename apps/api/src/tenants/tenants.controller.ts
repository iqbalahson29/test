import type { Request } from 'express';
import type { AnyAccessTokenPayload } from '../auth/token.types';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { DeleteTenantDto } from './dto/delete-tenant.dto';
import { TenantsService } from './tenants.service';

// AuthGuard('jwt') here, not JwtAuthGuard — a super admin's token is
// 'superadmin', not 'access' (see TenantRequestsController for the same
// pattern).
@Controller('tenants')
@UseGuards(AuthGuard('jwt'), SuperAdminGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list() {
    return this.tenants.listForSuperAdmin();
  }

  @Post(':id/suspend')
  suspend(
    @Param('id') id: string,
    @Req() req: Request & { user: AnyAccessTokenPayload },
  ) {
    return this.tenants.suspend(id, req.user);
  }

  @Post(':id/reactivate')
  reactivate(
    @Param('id') id: string,
    @Req() req: Request & { user: AnyAccessTokenPayload },
  ) {
    return this.tenants.reactivate(id, req.user);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Body() dto: DeleteTenantDto,
    @Req() req: Request & { user: AnyAccessTokenPayload },
  ) {
    return this.tenants.remove(id, dto.slug, req.user);
  }
}
