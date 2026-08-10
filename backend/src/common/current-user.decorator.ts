import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  userId: number;
  email: string;
  role: string;
  tag: string;
}

// Populated by JwtStrategy.validate() — mirrors reading claims off HttpContext.User in the old
// app's controllers (ClaimTypes.NameIdentifier/Email/Role, plus the custom "Tag" claim).
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): CurrentUserPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
