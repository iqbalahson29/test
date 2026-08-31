import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AUTH_THROTTLE } from '../common/auth-throttle.constant';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { EnterWorkspaceDto } from './dto/enter-workspace.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SelectWorkspaceDto } from './dto/select-workspace.dto';
import { SwitchWorkspaceDto } from './dto/switch-workspace.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SuperAdminGuard } from './super-admin.guard';
import type { AccessTokenPayload, AnyTokenPayload } from './token.types';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  // Not scoped to e.g. /auth: the browser's view of the path depends on
  // how the frontend proxies API calls (dev: /api/auth/..., prod: maybe
  // no prefix at all), so root is the only path that's always correct.
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Tighter than the global default: these are the routes brute-force /
  // credential-stuffing attempts actually target.
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    const result = await this.authService.login(user.id);

    if (result.status === 'choose-workspace') {
      // No refresh cookie yet — the session isn't established until a
      // workspace is chosen via /auth/select-workspace.
      return {
        status: 'choose-workspace',
        selectionToken: result.selectionToken,
        choices: result.choices,
      };
    }

    res.cookie(REFRESH_COOKIE, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    if (result.status === 'ok') {
      return {
        status: 'ok',
        accessToken: result.accessToken,
        membership: result.membership,
      };
    }
    if (result.status === 'no-workspace') {
      return { status: 'no-workspace', accessToken: result.accessToken };
    }
    return { status: 'superadmin', accessToken: result.accessToken };
  }

  // Same throttle as login/register — the endpoint an attacker would hammer
  // to spam a target's inbox or brute-force enumerate registered emails.
  @Throttle(AUTH_THROTTLE)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('select-workspace')
  @HttpCode(HttpStatus.OK)
  async selectWorkspace(
    @Body() dto: SelectWorkspaceDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.selectWorkspace(
      dto.selectionToken,
      dto.membershipId,
    );
    // selectWorkspace() never actually resolves any other status — this
    // just satisfies the shared LoginResult return type.
    if (result.status !== 'ok') {
      throw new UnauthorizedException();
    }
    res.cookie(REFRESH_COOKIE, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return {
      status: 'ok',
      accessToken: result.accessToken,
      membership: result.membership,
    };
  }

  @Post('switch-workspace')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async switchWorkspace(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SwitchWorkspaceDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.switchWorkspace(
      user.sub,
      dto.membershipId,
    );
    // switchWorkspace() never actually resolves any other status — this
    // just satisfies the shared LoginResult return type.
    if (result.status !== 'ok') {
      throw new UnauthorizedException();
    }
    res.cookie(REFRESH_COOKIE, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return {
      status: 'ok',
      accessToken: result.accessToken,
      membership: result.membership,
    };
  }

  // AuthGuard('jwt') here, not JwtAuthGuard — a super admin's token is
  // 'superadmin', not 'access'.
  @Post('enter-workspace')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'), SuperAdminGuard)
  async enterWorkspace(
    @Req() req: Request & { user: AnyTokenPayload },
    @Body() dto: EnterWorkspaceDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.enterWorkspace(
      req.user.sub,
      dto.tenantId,
    );
    // enterWorkspace() never actually resolves any other status — this
    // just satisfies the shared LoginResult return type.
    if (result.status !== 'ok') {
      throw new UnauthorizedException();
    }
    res.cookie(REFRESH_COOKIE, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return {
      status: 'ok',
      accessToken: result.accessToken,
      membership: result.membership,
    };
  }

  @Post('exit-workspace')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async exitWorkspace(
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.exitToSuperAdmin(user.sub);
    // exitToSuperAdmin() never actually resolves any other status — this
    // just satisfies the shared LoginResult return type.
    if (result.status !== 'superadmin') {
      throw new UnauthorizedException();
    }
    res.cookie(REFRESH_COOKIE, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return { status: 'superadmin', accessToken: result.accessToken };
  }

  @Get('my-memberships')
  @UseGuards(JwtAuthGuard)
  myMemberships(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.myMemberships(user.sub);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) {
      throw new UnauthorizedException('No refresh token');
    }
    const result = await this.authService.refresh(token);
    res.cookie(REFRESH_COOKIE, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    if (result.status === 'ok') {
      return {
        status: 'ok',
        accessToken: result.accessToken,
        membership: result.membership,
      };
    }
    if (result.status === 'no-workspace') {
      return { status: 'no-workspace', accessToken: result.accessToken };
    }
    return { status: 'superadmin', accessToken: result.accessToken };
  }

  // AuthGuard('jwt') here, not JwtAuthGuard — this route must accept
  // 'access', 'superadmin', and 'account' token payloads alike.
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@Req() req: Request & { user: AnyTokenPayload }) {
    if (req.user.type === 'superadmin') {
      return { status: 'superadmin' };
    }
    if (req.user.type === 'access') {
      return { status: 'ok', membershipId: req.user.membershipId };
    }
    if (req.user.type === 'account') {
      return { status: 'no-workspace' };
    }
    throw new UnauthorizedException();
  }

  // Bare AuthGuard('jwt'), not JwtAuthGuard — profile editing must work for
  // 'account' tokens (no membership yet) as well as 'access' ones.
  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req: Request & { user: AnyTokenPayload }) {
    const membershipId =
      req.user.type === 'access' ? req.user.membershipId : undefined;
    return this.authService.getProfile(req.user.sub, membershipId);
  }

  // Tighter than the global default — this is the endpoint that verifies a
  // guessed currentPassword, so it's the natural brute-force target.
  @Throttle(AUTH_THROTTLE)
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async updateProfile(
    @Req() req: Request & { user: AnyTokenPayload },
    @Body() dto: UpdateProfileDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { profile, tokens } = await this.authService.updateProfile(req.user, dto);
    if (tokens) {
      // The password just changed — this re-issues *this* session's own
      // tokens on the new tokenVersion (see AuthService.updateProfile), so
      // only this session survives; every other one is logged out the next
      // time it tries to refresh.
      res.cookie(REFRESH_COOKIE, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
      return { ...profile, accessToken: tokens.accessToken };
    }
    return profile;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
    return { status: 'ok' };
  }
}
