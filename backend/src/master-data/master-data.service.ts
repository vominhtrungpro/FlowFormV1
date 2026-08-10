import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class MasterDataService {
  constructor(private prisma: PrismaService) {}

  // Ports the ReferenceLookup case in _FieldInput.cshtml: the whole Plant->Area->Unit hierarchy is
  // fetched once and the frontend cascades client-side against it (no per-level AJAX), same as the
  // old app's embedded data-master JSON blob.
  async plants() {
    return this.prisma.db.masterPlant.findMany({
      orderBy: { name: 'asc' },
      include: {
        areas: {
          where: { metaIsDeleted: false },
          orderBy: { name: 'asc' },
          include: { units: { where: { metaIsDeleted: false }, orderBy: { name: 'asc' } } },
        },
      },
    });
  }
}
