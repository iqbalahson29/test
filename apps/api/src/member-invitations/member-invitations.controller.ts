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
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AccessTokenPayload } from '../auth/token.types';
import type { Request, Response } from 'express';
import { AuthCookies } from '../auth/security/cookies';
import { OptionalAccessGuard } from '../auth/security/optional-access.guard';
import { parse, schemas } from '../auth/auth.schemas';
import { BulkCreateInvitationsDto } from './dto/bulk-create-invitations.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { MemberInvitationsService } from './member-invitations.service';

@Controller('member-invitations')
export class MemberInvitationsController {
  constructor(
    private readonly invitations: MemberInvitationsService,
    private readonly cookies: AuthCookies,
  ) {}

  @Post('inspect')
  @HttpCode(200)
  inspect(@Body() b: unknown, @Req() req: Request) {
    return this.invitations.inspect(
      parse(schemas.inspect, b).token,
      req.ip ?? '',
    );
  }
  @Post('accept')
  @HttpCode(200)
  @UseGuards(OptionalAccessGuard)
  accept(
    @Body() b: unknown,
    @Req() req: Request & { user?: AccessTokenPayload },
  ) {
    return this.invitations.accept(
      parse(schemas.accept, b),
      this.cookies.context(req),
      req.user,
    );
  }
  @Post(':id/resend')
  @HttpCode(202)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  resend(
    @Param('id') id: string,
    @Body() b: unknown,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    parse(schemas.empty, b);
    return this.invitations.resend(user.tenantId, id, user);
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
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitations.create(user.tenantId, dto, user);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  bulkCreate(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: BulkCreateInvitationsDto,
  ) {
    return this.invitations.bulkCreate(user.tenantId, dto.entries, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  revoke(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.invitations.revoke(user.tenantId, id, user);
  }
}
