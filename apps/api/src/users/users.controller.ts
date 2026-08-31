import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { DeleteUserDto } from './dto/delete-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

// AuthGuard('jwt') here, not JwtAuthGuard — a super admin's token is
// 'superadmin', not 'access' (see TenantRequestsController for the same
// pattern).
@Controller('users')
@UseGuards(AuthGuard('jwt'), SuperAdminGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.listForSuperAdmin();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Post(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.users.suspend(id);
  }

  @Post(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.users.reactivate(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Body() dto: DeleteUserDto) {
    return this.users.remove(id, dto.email);
  }
}
