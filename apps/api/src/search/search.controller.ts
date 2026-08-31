import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { AnyTokenPayload } from '../auth/token.types';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // Bare AuthGuard('jwt') — searches across every workspace the identity
  // belongs to, so it isn't scoped to (and doesn't need) a single active
  // tenant/membership the way most other endpoints are. Works for
  // 0-membership 'account' tokens too (they'll just get workspace results).
  @Get()
  @UseGuards(AuthGuard('jwt'))
  search(@Req() req: Request & { user: AnyTokenPayload }, @Query('q') q?: string) {
    return this.searchService.search(req.user.sub, q ?? '');
  }
}
