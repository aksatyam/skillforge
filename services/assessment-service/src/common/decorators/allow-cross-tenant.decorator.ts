import { SetMetadata } from '@nestjs/common';

export const ALLOW_CROSS_TENANT_KEY = 'allowCrossTenant';

/**
 * Marks a route as allowed to operate across tenants.
 *
 * TenantGuard will:
 *   1. Skip the JWT orgId vs URL orgId match check.
 *   2. Require the user role to be 'super_admin' (ADR-007).
 *   3. Emit an audit log row via AuditLogInterceptor (action='cross_tenant_access').
 *
 * @example
 *   @AllowCrossTenant()
 *   @Roles('super_admin')
 *   @Get('admin/all-orgs')
 *   listAllOrgs() { ... }
 */
export const AllowCrossTenant = () => SetMetadata(ALLOW_CROSS_TENANT_KEY, true);
