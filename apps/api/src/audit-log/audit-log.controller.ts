import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload } from '../auth/token.types';
import { AuditLogService } from './audit-log.service';

@Controller('audit-log')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  // Powers the members page's "Recent activity" card (default) and its
  // "View all" dialog (?limit=50) — both read tenant-wide events, not just
  // quiz-scoped ones.
  @Get('recent')
  recent(@CurrentUser() user: AccessTokenPayload, @Query('limit') limit?: string) {
    const parsed = limit ? Number.parseInt(limit, 10) : NaN;
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : undefined;
    return this.auditLog.listForTenant(user.tenantId, take);
  }
}
