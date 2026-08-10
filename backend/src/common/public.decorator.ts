import { SetMetadata } from '@nestjs/common';

// Marks a route as exempt from the global JwtAuthGuard — the old app's equivalent is
// AccountController's [AllowAnonymous] against the global AuthorizeFilter in Program.cs.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
