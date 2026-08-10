import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const users = await this.prisma.db.user.findMany({ orderBy: { email: 'asc' } });
    return users.map((u) => ({ id: u.id, email: u.email, role: u.role, tag: u.tag }));
  }

  // Distinct Role/Tag values across real users — powers the Role/Tag actor-type pickers in the
  // WorkflowDesigner, same as WorkflowDesignerController.Design's ViewBag.RoleOptions/TagOptions.
  async roleOptions() {
    const users = await this.prisma.db.user.findMany();
    return [...new Set(users.map((u) => u.role))].sort();
  }

  async tagOptions() {
    const users = await this.prisma.db.user.findMany();
    return [...new Set(users.map((u) => u.tag))].sort();
  }
}
