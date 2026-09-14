import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthCookies } from './security/cookies';
import { AnyAccessTokenPayload } from './token.types';
import { OptionalAccessGuard } from './security/optional-access.guard';
import { SessionOutput, SessionService } from './session.service';
import { OtpService } from './otp.service';
import { CredentialsService } from './credentials.service';
import { GoogleService } from './google.service';
import { RateLimitsService } from './security/rate-limits.service';
import { AuthClock, authError, serial } from './security/primitives';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { SuperAdminGuard } from './super-admin.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { parse, schemas } from './auth.schemas';
type AuthRequest = Request & { user: AnyAccessTokenPayload };
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookies,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
    private readonly credentials: CredentialsService,
    private readonly google: GoogleService,
    private readonly rates: RateLimitsService,
    private readonly db: PrismaService,
    private readonly mail: MailerService,
    private readonly clock: AuthClock,
  ) {}
  output(res: Response, output: SessionOutput | { result: unknown }) {
    if ('refreshToken' in output && output.refreshToken)
      this.cookies.set(
        res,
        'refresh_token',
        output.refreshToken,
        output.refreshExpiresAt!.getTime() - this.clock.now().getTime(),
      );
    if ('contextToken' in output && output.contextToken) {
      this.cookies.set(res, 'auth_context', output.contextToken, 600000);
      if (output.result.status === 'choose-workspace')
        this.cookies.clear(res, 'refresh_token');
    }
    if ('clearDevice' in output && output.clearDevice)
      this.cookies.clear(res, 'device_token');
    if ('deviceToken' in output && output.deviceToken)
      this.cookies.set(
        res,
        'device_token',
        output.deviceToken,
        output.deviceExpiresAt!.getTime() - this.clock.now().getTime(),
      );
    if ('rememberDeviceAllowed' in output)
      res.setHeader(
        'X-Quiz-Remember-Device',
        String(output.rememberDeviceAllowed),
      );
    return output.result;
  }
  @Post('context')
  @HttpCode(200)
  async context(
    @Body() b: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    parse(schemas.empty, b);
    await this.rates.gate('context', req.ip ?? '', 30);
    this.cookies.ensure(req, res);
    return { status: 'ok' };
  }
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() b: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const d = parse(schemas.login, b);
    return this.output(
      res,
      await this.auth.login(
        d.identifier,
        d.password,
        this.cookies.context(req),
      ),
    );
  }
  @Post('register')
  @HttpCode(202)
  register(
    @Body() b: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('X-Quiz-Remember-Device', 'true');
    return this.auth.register(
      parse(schemas.register, b),
      this.cookies.context(req),
    );
  }
  @Post('otp/resend')
  @HttpCode(200)
  @UseGuards(OptionalAccessGuard)
  async resend(
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.otp.resend(
      parse(schemas.resend, b).challengeId,
      this.cookies.context(req),
      req.user,
    );
    res.status(r.public ? 202 : 200);
    return r.envelope;
  }
  @Post('otp/verify')
  @HttpCode(200)
  @UseGuards(OptionalAccessGuard)
  async verify(
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const d = parse(schemas.verify, b);
    return this.output(
      res,
      await this.auth.verify(
        d.challengeId,
        d.code,
        d.rememberDevice,
        this.cookies.context(req),
        req.user,
      ),
    );
  }
  @Post('google/nonce')
  @HttpCode(200)
  @UseGuards(OptionalAccessGuard)
  async nonce(
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const d = parse(schemas.nonce, b);
    await this.rates.gate('nonce', req.ip ?? '', 30);
    const ctx = this.cookies.ensure(req, res);
    return serial(this.db, (tx) =>
      this.google.nonce(tx, d.intent, ctx, req.user),
    );
  }
  @Post('google')
  @HttpCode(200)
  async googleLogin(
    @Body() b: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.output(
      res,
      await this.auth.google(
        parse(schemas.credential, b).credential,
        this.cookies.context(req),
      ),
    );
  }
  @Post('google/link/request')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  linkRequest(@Body() b: unknown, @Req() req: AuthRequest) {
    return this.auth.requestLink(
      parse(schemas.credential, b).credential,
      this.cookies.context(req),
      req.user,
    );
  }
  @Post('google/link/complete')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  linkComplete(@Body() b: unknown, @Req() req: AuthRequest) {
    const d = parse(schemas.link, b);
    return this.credentials.link(
      d.pendingLinkId,
      d.grantToken,
      req.user,
      this.cookies.context(req),
    );
  }
  @Delete('google/link')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async unlink(
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.output(
      res,
      await this.credentials.unlink(
        parse(schemas.grant, b).grantToken,
        req.user,
        this.cookies.context(req),
      ),
    );
  }
  @Post('step-up/request')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  stepUp(@Body() b: unknown, @Req() req: AuthRequest) {
    const d = parse(schemas.stepUp, b);
    return this.credentials.stepUp(
      d.action,
      d.target,
      req.user,
      this.cookies.context(req),
    );
  }
  @Post('step-up/verify')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  stepVerify(@Body() b: unknown, @Req() req: AuthRequest) {
    const d = parse(schemas.verifyOnly, b);
    return this.credentials.verifyGrant(
      'STEP_UP',
      d.challengeId,
      d.code,
      this.cookies.context(req),
      req.user,
    );
  }
  @Post('password-reset/request')
  @HttpCode(202)
  resetRequest(@Body() b: unknown, @Req() req: Request) {
    return this.credentials.requestReset(
      parse(schemas.resetRequest, b).identifier,
      this.cookies.context(req),
    );
  }
  @Post('password-reset/verify')
  @HttpCode(200)
  resetVerify(@Body() b: unknown, @Req() req: Request) {
    const d = parse(schemas.verifyOnly, b);
    return this.credentials.verifyGrant(
      'PASSWORD_RESET',
      d.challengeId,
      d.code,
      this.cookies.context(req),
    );
  }
  @Post('password-reset/complete')
  @HttpCode(200)
  async resetComplete(
    @Body() b: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const d = parse(schemas.resetComplete, b);
    const result = await this.credentials.reset(
      d.grantToken,
      d.newPassword,
      this.cookies.context(req),
    );
    for (const k of ['refresh_token', 'device_token', 'auth_context'] as const)
      this.cookies.clear(res, k);
    return result;
  }
  @Post('password/change')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async changePassword(
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.output(
      res,
      await this.credentials.password(
        'PASSWORD_CHANGE',
        parse(schemas.passwordChange, b),
        req.user,
        this.cookies.context(req),
      ),
    );
  }
  @Post('password/set')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async setPassword(
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.output(
      res,
      await this.credentials.password(
        'PASSWORD_SET',
        parse(schemas.passwordSet, b),
        req.user,
        this.cookies.context(req),
      ),
    );
  }
  @Post('email-change/request')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  requestEmail(@Body() b: unknown, @Req() req: AuthRequest) {
    return this.credentials.requestEmail(
      parse(schemas.emailChange, b),
      req.user,
      this.cookies.context(req),
    );
  }
  @Post('email-change/verify')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async verifyEmail(
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const d = parse(schemas.verifyOnly, b);
    return this.output(
      res,
      await this.credentials.verifyEmail(
        d.challengeId,
        d.code,
        req.user,
        this.cookies.context(req),
      ),
    );
  }
  @Post('select-workspace')
  @HttpCode(200)
  async select(
    @Body() b: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const d = parse(schemas.selection, b);
    return this.output(
      res,
      await this.sessions.select(
        d.selectionToken,
        d.membershipId,
        this.cookies.context(req),
      ),
    );
  }
  @Post('switch-workspace')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async switchWorkspace(
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.output(
      res,
      await this.sessions.switch(
        req.user,
        this.cookies.get(req, 'refresh_token'),
        parse(schemas.switch, b),
      ),
    );
  }
  @Post('enter-workspace')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'), SuperAdminGuard)
  async enter(
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.output(
      res,
      await this.sessions.switch(
        req.user,
        this.cookies.get(req, 'refresh_token'),
        parse(schemas.enter, b),
      ),
    );
  }
  @Post('exit-workspace')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async exit(
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    parse(schemas.empty, b);
    return this.output(
      res,
      await this.sessions.switch(
        req.user,
        this.cookies.get(req, 'refresh_token'),
        { exit: true },
      ),
    );
  }
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() b: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    parse(schemas.empty, b);
    const token = this.cookies.get(req, 'refresh_token');
    if (!token) throw authError('SESSION_INVALID', 401);
    try {
      return this.output(res, await this.sessions.refresh(token, req.ip ?? ''));
    } catch (e) {
      if (
        e &&
        typeof e === 'object' &&
        'getStatus' in e &&
        (e as { getStatus: () => number }).getStatus() === 401
      )
        this.cookies.clear(res, 'refresh_token');
      throw e;
    }
  }
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const d = parse(schemas.logout, b);
    await this.sessions.logout(
      this.cookies.get(req, 'refresh_token'),
      this.sessions.readLogoutAccess(
        req.headers.authorization?.replace(/^Bearer /, ''),
      ),
      d.forgetDevice ? this.cookies.get(req, 'device_token') : undefined,
    );
    this.cookies.clear(res, 'refresh_token');
    this.cookies.clear(res, 'auth_context');
    if (d.forgetDevice) this.cookies.clear(res, 'device_token');
    return { status: 'ok' };
  }
  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'))
  async logoutAll(
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    parse(schemas.empty, b);
    await serial(this.db, async (tx) => {
      await this.sessions.live(tx, req.user);
      await this.sessions.invalidateUser(tx, req.user.sub, 'logout-all');
    });
    for (const k of ['refresh_token', 'auth_context', 'device_token'] as const)
      this.cookies.clear(res, k);
    return { status: 'ok' };
  }
  @Get('sessions')
  @UseGuards(AuthGuard('jwt'))
  listSessions(
    @Req() req: AuthRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.sessions.list(
      req.user,
      'sessions',
      undefined,
      cursor,
      limit ? Number(limit) : 20,
    );
  }
  @Get('devices')
  @UseGuards(AuthGuard('jwt'))
  listDevices(
    @Req() req: AuthRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.sessions.list(
      req.user,
      'devices',
      this.cookies.get(req, 'device_token'),
      cursor,
      limit ? Number(limit) : 20,
    );
  }
  @Delete('sessions/:id')
  @HttpCode(204)
  @UseGuards(AuthGuard('jwt'))
  async removeSession(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    parse(schemas.empty, b);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw authError('VALIDATION_ERROR');
    if (await this.sessions.remove(req.user, 'sessions', id))
      this.cookies.clear(res, 'refresh_token');
  }
  @Delete('devices/:id')
  @HttpCode(204)
  @UseGuards(AuthGuard('jwt'))
  async removeDevice(
    @Param('id') id: string,
    @Body() b: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    parse(schemas.empty, b);
    if (
      await this.sessions.remove(
        req.user,
        'devices',
        id,
        this.cookies.get(req, 'device_token'),
      )
    )
      this.cookies.clear(res, 'device_token');
  }
  @Get('my-memberships')
  @UseGuards(AuthGuard('jwt'))
  async memberships(@Req() req: AuthRequest) {
    return (await this.sessions.memberships(this.db, req.user.sub)).map((m) =>
      this.sessions.summary(m),
    );
  }
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@Req() req: AuthRequest) {
    return {
      status:
        req.user.type === 'access'
          ? 'ok'
          : req.user.type === 'superadmin'
            ? 'superadmin'
            : 'no-workspace',
      sessionId: req.user.sessionId,
      ...(req.user.type === 'access'
        ? { membershipId: req.user.membershipId }
        : {}),
    };
  }
  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  profile(@Req() req: AuthRequest) {
    return this.auth.getProfile(
      req.user.sub,
      req.user.type === 'access' ? req.user.membershipId : undefined,
      req.user.sessionId,
    );
  }
  @Patch('profile')
  @UseGuards(AuthGuard('jwt'))
  updateProfile(@Body() dto: UpdateProfileDto, @Req() req: AuthRequest) {
    return this.auth.updateProfile(req.user, dto);
  }
  @Get('admin/health')
  @UseGuards(AuthGuard('jwt'), SuperAdminGuard)
  health() {
    return this.mail.health();
  }
}
