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
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SelectWorkspaceDto } from './dto/select-workspace.dto';
import { SwitchWorkspaceDto } from './dto/switch-workspace.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
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

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

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

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  updateProfile(
    @Req() req: Request & { user: AnyTokenPayload },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(req.user.sub, dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
    return { status: 'ok' };
  }
}
