import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Req,
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
import type { Request } from 'express';
import type { AnyAccessTokenPayload } from '../auth/token.types';
import { AuthCookies } from '../auth/security/cookies';
import { parse, schemas } from '../auth/auth.schemas';

@Controller('tenant-requests')
export class TenantRequestsController {
  constructor(
    private readonly tenantRequests: TenantRequestsService,
    private readonly cookies: AuthCookies,
  ) {}

  @Post()
  @HttpCode(202)
  create(@Body() dto: CreateTenantRequestDto, @Req() req: Request) {
    return this.tenantRequests.create(dto, this.cookies.context(req));
  }

  @Post('verify')
  @HttpCode(200)
  verify(@Body() b: unknown, @Req() req: Request) {
    const d = parse(schemas.verifyOnly, b);
    return this.tenantRequests.verify(
      d.challengeId,
      d.code,
      this.cookies.context(req),
    );
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
  approve(
    @Param('id') id: string,
    @Req() req: Request & { user: AnyAccessTokenPayload },
  ) {
    return this.tenantRequests.approve(id, req.user);
  }

  @Post(':id/reject')
  @UseGuards(AuthGuard('jwt'), SuperAdminGuard)
  reject(
    @Param('id') id: string,
    @Req() req: Request & { user: AnyAccessTokenPayload },
  ) {
    return this.tenantRequests.reject(id, req.user);
  }
}
