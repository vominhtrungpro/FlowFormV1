import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('api/users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Get('role-options')
  roleOptions() {
    return this.users.roleOptions();
  }

  @Get('tag-options')
  tagOptions() {
    return this.users.tagOptions();
  }
}
