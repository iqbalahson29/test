import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { RolesGuard } from '../auth/roles.guard';
import type { AnyTokenPayload } from '../auth/token.types';
import { NotificationsService } from './notifications.service';

type NotificationScope = { membershipId: string } | { userId: string };

function scopeFor(user: AnyTokenPayload): NotificationScope {
  if (user.type === 'access') return { membershipId: user.membershipId };
  if (user.type === 'superadmin') return { userId: user.sub };
  throw new ForbiddenException('Notifications are not available for this session');
}

// AuthGuard('jwt') here, not JwtAuthGuard — a super admin's token is
// 'superadmin', not 'access', and still needs its own notifications
// (scoped by recipientUserId instead of membershipId — see scopeFor()
// above). No @Roles() here either: every session reads/manages only its
// own notifications, scoped in the service layer, never by an id lookup
// alone.
@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Req() req: Request & { user: AnyTokenPayload },
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const scope = scopeFor(req.user);
    const opts = { cursor, limit: limit ? Number.parseInt(limit, 10) : undefined };
    return 'membershipId' in scope
      ? this.notifications.list(scope.membershipId, opts)
      : this.notifications.listForUser(scope.userId, opts);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: Request & { user: AnyTokenPayload }) {
    const scope = scopeFor(req.user);
    const count =
      'membershipId' in scope
        ? await this.notifications.unreadCount(scope.membershipId)
        : await this.notifications.unreadCountForUser(scope.userId);
    return { count };
  }

  @Post('read-all')
  markAllRead(@Req() req: Request & { user: AnyTokenPayload }) {
    const scope = scopeFor(req.user);
    return 'membershipId' in scope
      ? this.notifications.markAllRead(scope.membershipId)
      : this.notifications.markAllReadForUser(scope.userId);
  }

  @Patch(':id/read')
  markRead(@Req() req: Request & { user: AnyTokenPayload }, @Param('id') id: string) {
    const scope = scopeFor(req.user);
    return 'membershipId' in scope
      ? this.notifications.markRead(scope.membershipId, id)
      : this.notifications.markReadForUser(scope.userId, id);
  }

  @Delete('clear-all')
  clearAll(@Req() req: Request & { user: AnyTokenPayload }) {
    const scope = scopeFor(req.user);
    return 'membershipId' in scope
      ? this.notifications.clearAll(scope.membershipId)
      : this.notifications.clearAllForUser(scope.userId);
  }

  @Delete(':id')
  remove(@Req() req: Request & { user: AnyTokenPayload }, @Param('id') id: string) {
    const scope = scopeFor(req.user);
    return 'membershipId' in scope
      ? this.notifications.remove(scope.membershipId, id)
      : this.notifications.removeForUser(scope.userId, id);
  }
}
