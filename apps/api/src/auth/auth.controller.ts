import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import type { AnyTokenPayload } from './token.types';

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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    const result = await this.authService.login(user.id);

    res.cookie(REFRESH_COOKIE, result.refreshToken, REFRESH_COOKIE_OPTIONS);
    if (result.status === 'ok') {
      return {
        status: 'ok',
        accessToken: result.accessToken,
        membership: result.membership,
      };
    }
    return { status: 'superadmin', accessToken: result.accessToken };
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
    return { status: 'superadmin', accessToken: result.accessToken };
  }

  // AuthGuard('jwt') here, not JwtAuthGuard — this route must accept both
  // 'access' (tenant member) and 'superadmin' token payloads.
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@Req() req: Request & { user: AnyTokenPayload }) {
    if (req.user.type === 'superadmin') {
      return { status: 'superadmin' };
    }
    if (req.user.type === 'access') {
      return { status: 'ok', membershipId: req.user.membershipId };
    }
    throw new UnauthorizedException();
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_OPTIONS);
    return { status: 'ok' };
  }
}
