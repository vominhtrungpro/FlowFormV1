import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './soft-delete.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // Every feature service should read through this, not the raw PrismaClient methods inherited
  // above, so soft-deleted rows never leak back into a list/detail response. `db` intentionally
  // exposes only the soft-delete-filtered client; use the raw `this` (via the base class) only
  // for writes that need to bypass the filter, e.g. resolving a row by id specifically to soft-
  // delete it.
  db = this.$extends(softDeleteExtension);

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
