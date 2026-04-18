import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@skillforge/db';
import { withTenant, type TenantId } from '@skillforge/tenant-guard';
import type {
  InviteUserDto,
  UpdateUserDto,
  UserResponse,
  UserRole,
} from '@skillforge/shared-types';
import { AuthService } from '../auth/auth.service';

function toResponse(u: {
  id: string;
  email: string;
  name: string;
  roleFamily: string;
  designation: string;
  role: UserRole;
  managerId: string | null;
  inviteAcceptedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}): UserResponse {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roleFamily: u.roleFamily,
    designation: u.designation,
    role: u.role,
    managerId: u.managerId,
    inviteAcceptedAt: u.inviteAcceptedAt?.toISOString() ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

@Injectable()
export class UserService {
  constructor(private readonly auth: AuthService) {}

  async list(orgId: TenantId, filter?: { role?: UserRole; query?: string }) {
    return withTenant(orgId, async (tx) => {
      const where: Prisma.UserWhereInput = {
        deletedAt: null,
        ...(filter?.role ? { role: filter.role } : {}),
        ...(filter?.query
          ? {
              OR: [
                { email: { contains: filter.query, mode: 'insensitive' } },
                { name: { contains: filter.query, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const users = await tx.user.findMany({
        where,
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      });
      return users.map(toResponse);
    });
  }

  async get(orgId: TenantId, id: string): Promise<UserResponse> {
    return withTenant(orgId, async (tx) => {
      const u = await tx.user.findFirst({ where: { id, deletedAt: null } });
      if (!u) throw new NotFoundException();
      return toResponse(u);
    });
  }

  /**
   * Create a user row + issue a one-time invite token. Does NOT email the
   * token yet (notification-service is Sprint 4). Returns the raw token so
   * HR can copy the link for the invitee.
   */
  async invite(
    orgId: TenantId,
    actorId: string,
    dto: InviteUserDto,
  ): Promise<{ user: UserResponse; inviteToken: string; inviteExpiresAt: string }> {
    // Validate manager, if provided, exists in the same tenant.
    const user = await withTenant(orgId, async (tx) => {
      if (dto.managerId) {
        const mgr = await tx.user.findFirst({
          where: { id: dto.managerId, deletedAt: null },
        });
        if (!mgr) throw new BadRequestException('managerId does not exist in this org');
      }

      // Check email uniqueness within tenant
      const existing = await tx.user.findFirst({
        where: { email: dto.email, deletedAt: null },
      });
      if (existing) {
        throw new ConflictException('A user with this email already exists in your organization');
      }

      return tx.user.create({
        data: {
          orgId,
          email: dto.email,
          name: dto.name,
          roleFamily: dto.roleFamily,
          designation: dto.designation,
          role: dto.role,
          managerId: dto.managerId ?? null,
          createdById: actorId,
        },
      });
    });

    const invite = await this.auth.issueInviteToken(user.id);

    return {
      user: toResponse(user),
      inviteToken: invite.token,
      inviteExpiresAt: invite.expiresAt.toISOString(),
    };
  }

  async reissueInvite(orgId: TenantId, userId: string) {
    // Confirm user exists in tenant before reissuing (RLS will 404 silently otherwise)
    await this.get(orgId, userId);
    return this.auth.issueInviteToken(userId);
  }

  async update(
    orgId: TenantId,
    actorRole: UserRole,
    actorId: string,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserResponse> {
    return withTenant(orgId, async (tx) => {
      const target = await tx.user.findFirst({ where: { id, deletedAt: null } });
      if (!target) throw new NotFoundException();

      // Prevent HR from promoting users to super_admin (schema already forbids)
      // Prevent self-role-change (only super_admin can change their own role)
      if (dto.role && actorId === id && actorRole !== 'super_admin') {
        throw new ForbiddenException('Cannot change your own role');
      }

      // Manager must exist in-org if being reassigned
      if (dto.managerId) {
        const mgr = await tx.user.findFirst({
          where: { id: dto.managerId, deletedAt: null },
        });
        if (!mgr) throw new BadRequestException('managerId does not exist in this org');
        // Prevent manager cycles: new manager must not report (transitively) to target
        if (await this.wouldCreateCycle(tx, id, dto.managerId)) {
          throw new BadRequestException('Assignment would create a manager cycle');
        }
      }

      const updated = await tx.user.update({
        where: { id },
        data: {
          ...dto,
          version: { increment: 1 },
        },
      });
      return toResponse(updated);
    });
  }

  async deactivate(orgId: TenantId, id: string, actorId: string) {
    if (id === actorId) throw new ForbiddenException('Cannot deactivate yourself');
    return withTenant(orgId, (tx) =>
      tx.user.update({ where: { id }, data: { deletedAt: new Date() } }),
    );
  }

  private async wouldCreateCycle(
    tx: Prisma.TransactionClient,
    userId: string,
    newManagerId: string,
  ): Promise<boolean> {
    // Walk up from newManagerId; if we encounter userId, it's a cycle.
    let cursor: string | null = newManagerId;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor)) {
      if (cursor === userId) return true;
      visited.add(cursor);
      const row: { manager_id: string | null }[] = await tx.$queryRawUnsafe(
        `SELECT manager_id FROM users WHERE id = $1`,
        cursor,
      );
      cursor = row[0]?.manager_id ?? null;
    }
    return false;
  }
}
