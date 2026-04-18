import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_CROSS_TENANT_KEY } from '../decorators/allow-cross-tenant.decorator';

/**
 * Enforces tenant isolation per ADR-007.
 *
 * Rules:
 *   1. If route is @Public, skip.
 *   2. If route is @AllowCrossTenant:
 *      - User role must be 'super_admin', else ForbiddenException.
 *      - No orgId match check; AuditLogInterceptor records the access.
 *   3. Else, if the URL path contains /orgs/:orgId, it MUST equal JWT orgId.
 *      - On mismatch, return 404 Not Found (NOT 403 — avoids tenant enumeration).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const allowCrossTenant = this.reflector.getAllAndOverride<boolean>(
      ALLOW_CROSS_TENANT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      // JwtAuthGuard should have run first; if user is absent, fail closed.
      throw new ForbiddenException('No authenticated user in request');
    }

    if (allowCrossTenant) {
      if (user.role !== 'super_admin') {
        throw new ForbiddenException('Cross-tenant access requires super_admin role');
      }
      return true;
    }

    // URL-path tenant scope check
    const urlOrgId: string | undefined = req.params?.orgId;
    if (urlOrgId && urlOrgId !== user.orgId) {
      // 404 by design — don't leak tenant existence.
      throw new NotFoundException();
    }

    return true;
  }
}
