import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { DeleteUserDto } from './dto/delete-user.dto';
import type { Request } from 'express';
import type { AnyAccessTokenPayload } from '../auth/token.types';
import { CredentialsService } from '../auth/credentials.service';
import { AuthCookies } from '../auth/security/cookies';
import { parse, schemas } from '../auth/auth.schemas';
import { UsersService } from './users.service';

// AuthGuard('jwt') here, not JwtAuthGuard — a super admin's token is
// 'superadmin', not 'access' (see TenantRequestsController for the same
// pattern).
@Controller('users')
@UseGuards(AuthGuard('jwt'), SuperAdminGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly credentials: CredentialsService,
    private readonly cookies: AuthCookies,
  ) {}

  @Get()
  list() {
    return this.users.listForSuperAdmin();
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request & { user: AnyAccessTokenPayload },
  ) {
    return this.credentials.adminUpdate(
      id,
      parse(schemas.adminUpdate, body),
      req.user,
      this.cookies.context(req),
    );
  }

  @Delete(':id/email-suppression')
  clearSuppression(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request & { user: AnyAccessTokenPayload },
  ) {
    const d = parse(schemas.clearSuppression, body);
    return this.credentials.clearSuppression(
      id,
      d.grantToken,
      d.reason,
      req.user,
      this.cookies.context(req),
    );
  }

  @Post(':id/suspend')
  suspend(
    @Param('id') id: string,
    @Req() req: Request & { user: AnyAccessTokenPayload },
  ) {
    return this.users.suspend(id, req.user);
  }

  @Post(':id/reactivate')
  reactivate(
    @Param('id') id: string,
    @Req() req: Request & { user: AnyAccessTokenPayload },
  ) {
    return this.users.reactivate(id, req.user);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Body() dto: DeleteUserDto,
    @Req() req: Request & { user: AnyAccessTokenPayload },
  ) {
    return this.users.remove(id, dto.email, req.user);
  }
}
