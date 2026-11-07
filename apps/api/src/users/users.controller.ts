import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updateProfileSchema, type Me, type UpdateProfileInput } from '@groundline/shared';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthContext): Promise<Me> {
    return this.users.getMe(user.userId);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthContext,
    @Body({ schema: updateProfileSchema }) body: UpdateProfileInput,
  ): Promise<Me> {
    return this.users.updateProfile(user.userId, body);
  }
}
