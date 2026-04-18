import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantId } from '@skillforge/tenant-guard';

/**
 * Extracts the tenant ID from the request context.
 * Populated by JwtAuthGuard after JWT validation.
 *
 * @example
 *   @Get('assessments')
 *   listAssessments(@CurrentTenant() orgId: TenantId) { ... }
 */
export const CurrentTenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantId => {
    const req = ctx.switchToHttp().getRequest();
    if (!req.orgId) {
      throw new Error('CurrentTenant called but request.orgId is not set — ensure JwtAuthGuard runs first');
    }
    return req.orgId as TenantId;
  },
);
