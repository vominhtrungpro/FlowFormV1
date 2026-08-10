import { Prisma } from '@prisma/client';

// Prisma has no EF-Core-style global query filter, so this replicates AppDbContext's
// `HasQueryFilter(e => !e.MetaIsDeleted)` loop by hand: every findMany/findFirst/findUnique/count
// across every model silently excludes soft-deleted rows, same as the old app did automatically.
// Soft-deleting itself is NOT intercepted here (no delete/deleteMany override) — services set
// `metaIsDeleted: true` explicitly via `.update()`, mirroring the old app's `entity.MetaIsDeleted =
// true; entity.OnUpdate(); SaveChanges();` pattern, so a real accidental `.delete()` call still
// throws loudly instead of being silently reinterpreted.
export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete-filter',
  query: {
    $allModels: {
      async findMany({ args, query }) {
        args.where = { ...args.where, metaIsDeleted: false };
        return query(args);
      },
      async findFirst({ args, query }) {
        args.where = { ...args.where, metaIsDeleted: false };
        return query(args);
      },
      async findUnique({ args, query }) {
        args.where = { ...args.where, metaIsDeleted: false } as typeof args.where;
        return query(args);
      },
      async count({ args, query }) {
        args.where = { ...args.where, metaIsDeleted: false };
        return query(args);
      },
    },
  },
});
