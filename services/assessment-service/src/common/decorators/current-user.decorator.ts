import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtClaims } from '@skillforge/shared-types';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtClaims => {
    const req = ctx.switchToHttp().getRequest();
    if (!req.user) {
      throw new Error('CurrentUser called but request.user is not set — ensure JwtAuthGuard runs first');
    }
    return req.user as JwtClaims;
  },
);
