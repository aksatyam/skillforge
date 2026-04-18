import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { prisma } from '@skillforge/db';
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

    return next.handle().pipe(
      tap(() => {
        void this.writeAuditRow(req, ctx, crossTenant ?? false);
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
  ): Promise<void> {
    try {
      const url = req.originalUrl ?? req.url ?? '';
      const action = crossTenant
        ? 'cross_tenant_access'
        : `${ctx.getClass().name}.${ctx.getHandler().name}`;

      // Best-effort entity ID extraction: last URL segment that looks like a UUID
      const uuidRe =
        /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;
      const entityId = uuidRe.exec(url)?.[1];

      await prisma.auditLog.create({
        data: {
          orgId: req.user?.orgId ?? '00000000-0000-0000-0000-000000000000',
          actorId: req.user?.sub,
          action,
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
