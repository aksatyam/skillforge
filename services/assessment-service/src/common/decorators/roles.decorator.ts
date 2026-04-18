import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@skillforge/shared-types';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route to specific roles. RbacGuard enforces this metadata.
 *
 * @example
 *   @Roles('hr_admin', 'super_admin')
 *   @Post('cycles')
 *   createCycle() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
