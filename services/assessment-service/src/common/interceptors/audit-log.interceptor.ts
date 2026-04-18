import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { prismaAdmin } from '@skillforge/db';
import { Observable, tap } from 'rxjs';
import { ALLOW_CROSS_TENANT_KEY } from '../decorators/allow-cross-tenant.decorator';

/**
 * Writes an audit_log row on every write request (POST/PUT/PATCH/DELETE)
 * AND on any @AllowCrossTenant route regardless of method.
 *
 * Does NOT log bodies or responses — those can contain PII. Logs:
 *   - orgId (tenant scope)
 *   - actorId (user making the call)
 *   - action (derived from method + URL)
 *   - entityType + entityId (parsed from URL)
 *   - rationale (if present in request body under `rationale` key)
 *   - IP + UA
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const method: string = req.method;
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const crossTenant = this.reflector.getAllAndOverride<boolean>(
      ALLOW_CROSS_TENANT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    if (!isWrite && !crossTenant) {
      return next.handle();
    }

    // Fire audit on BOTH success and error paths. Failed requests
    // (401/403/4xx) are often the most security-relevant events.
    return next.handle().pipe(
      tap({
        next: () => void this.writeAuditRow(req, ctx, crossTenant ?? false, 'success'),
        error: (err) =>
          void this.writeAuditRow(
            req,
            ctx,
            crossTenant ?? false,
            `error:${(err as { status?: number })?.status ?? 'unknown'}`,
          ),
      }),
    );
  }

  private async writeAuditRow(
    req: {
      method: string;
      originalUrl?: string;
      url?: string;
      user?: { sub: string; orgId: string };
      body?: Record<string, unknown>;
      ip?: string;
      headers?: Record<string, string | undefined>;
    },
    ctx: ExecutionContext,
    crossTenant: boolean,
    outcome: string,
  ): Promise<void> {
    try {
      const url = req.originalUrl ?? req.url ?? '';
      const action = crossTenant
        ? 'cross_tenant_access'
        : `${ctx.getClass().name}.${ctx.getHandler().name}`;

      const uuidRe =
        /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;
      const entityId = uuidRe.exec(url)?.[1];

      // Uses prismaAdmin (BYPASSRLS) — audit writes must succeed regardless
      // of the request's tenant context (a cross-tenant access has no valid
      // current_org_id to match the RLS WITH CHECK policy otherwise).
      await prismaAdmin.auditLog.create({
        data: {
          orgId: req.user?.orgId ?? '00000000-0000-0000-0000-000000000000',
          actorId: req.user?.sub,
          action: `${action}:${outcome}`,
          entityType: ctx.getClass().name.replace(/Controller$/, '').toLowerCase(),
          entityId,
          rationale: typeof req.body?.rationale === 'string' ? req.body.rationale : null,
          ipAddress: req.ip,
          userAgent: req.headers?.['user-agent'],
        },
      });
    } catch (err) {
      this.logger.error('Failed to write audit row', err);
    }
  }
}
