import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prismaAdmin, Prisma } from '@skillforge/db';
import type { AuthTokens, MeResponse } from '@skillforge/shared-types';
import { withTenant, TenantId } from '@skillforge/tenant-guard';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';

const INVITE_TTL_DAYS = 7;

/**
 * Auth service. Uses `prismaAdmin` (BYPASSRLS role) for pre-tenant flows
 * because we don't yet know which tenant the user belongs to. See
 * packages/db/src/index.ts for the admin-client rationale.
 */
@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  /**
   * Dev/Phase-1 login: email + password → JWT.
   * Replaced by Keycloak OIDC in Phase 2; this service still issues its
   * own short-lived JWT with tenant + role claims baked in.
   */
  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await prismaAdmin.user.findFirst({
      where: { email, deletedAt: null },
      select: {
        id: true,
        orgId: true,
        email: true,
        role: true,
        passwordHash: true,
        inviteAcceptedAt: true,
      },
    });

    const invalid = new UnauthorizedException('Invalid credentials');
    if (!user || !user.passwordHash) throw invalid;
    if (!user.inviteAcceptedAt) {
      throw new UnauthorizedException(
        'Invite not yet accepted — please set your password first',
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw invalid;

    await prismaAdmin.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens({
      sub: user.id,
      orgId: user.orgId,
      email: user.email,
      role: user.role,
    });
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    return prismaAdmin.$transaction(async (tx) => {
      const row = await tx.refreshToken.findUnique({ where: { tokenHash: hash } });
      if (!row || row.revokedAt || row.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      await tx.refreshToken.update({
        where: { tokenHash: hash },
        data: { revokedAt: new Date() },
      });

      const user = await tx.user.findFirst({
        where: { id: row.userId, deletedAt: null },
        select: { id: true, orgId: true, email: true, role: true },
      });
      if (!user) throw new UnauthorizedException();

      return this.issueTokensInTx(tx, {
        sub: user.id,
        orgId: user.orgId,
        email: user.email,
        role: user.role,
      });
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await prismaAdmin.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Current user + tenant display info. Uses withTenant — JWT is validated. */
  async me(orgId: TenantId, userId: string): Promise<MeResponse> {
    return withTenant(orgId, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { org: { select: { name: true } } },
      });
      if (!user) throw new UnauthorizedException();
      return {
        id: user.id,
        orgId: user.orgId,
        orgName: user.org.name,
        email: user.email,
        name: user.name,
        role: user.role,
        roleFamily: user.roleFamily,
        designation: user.designation,
        managerId: user.managerId,
        mfaEnabled: user.mfaEnabled,
      };
    });
  }

  // ── Invite flow ────────────────────────────────────────────────

  /**
   * Generate a one-time invite token for a user. Caller must pass orgId;
   * we verify the user belongs to that tenant before issuing the token.
   * Uses admin client because the update must succeed even if RLS would
   * otherwise filter (e.g., HR's tenant context matches — but defense in depth).
   */
  async issueInviteToken(
    orgId: TenantId,
    userId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const result = await prismaAdmin.user.updateMany({
      where: { id: userId, orgId, deletedAt: null },
      data: {
        inviteTokenHash: hash,
        inviteExpiresAt: expiresAt,
        inviteAcceptedAt: null,
      },
    });
    if (result.count === 0) {
      throw new BadRequestException('User not found in this tenant');
    }

    return { token, expiresAt };
  }

  /**
   * Accept invite: validate token, set password, issue JWTs. All atomic in
   * a single transaction so a crash mid-flow leaves no half-committed state.
   */
  async acceptInvite(token: string, password: string): Promise<AuthTokens> {
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    return prismaAdmin.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { inviteTokenHash: hash, deletedAt: null },
        select: {
          id: true,
          orgId: true,
          email: true,
          role: true,
          inviteExpiresAt: true,
          inviteAcceptedAt: true,
        },
      });

      if (!user) throw new BadRequestException('Invalid or expired invite');
      if (user.inviteAcceptedAt) throw new BadRequestException('Invite already accepted');
      if (!user.inviteExpiresAt || user.inviteExpiresAt < new Date()) {
        throw new BadRequestException('Invite has expired — ask HR to re-issue');
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          inviteAcceptedAt: new Date(),
          inviteTokenHash: null,
          inviteExpiresAt: null,
        },
      });

      return this.issueTokensInTx(tx, {
        sub: user.id,
        orgId: user.orgId,
        email: user.email,
        role: user.role,
      });
    });
  }

  // ── JWT issuance ───────────────────────────────────────────────

  private async issueTokens(payload: {
    sub: string;
    orgId: string;
    email: string;
    role: string;
  }): Promise<AuthTokens> {
    return prismaAdmin.$transaction((tx) => this.issueTokensInTx(tx, payload));
  }

  private async issueTokensInTx(
    tx: Prisma.TransactionClient,
    payload: { sub: string; orgId: string; email: string; role: string },
  ): Promise<AuthTokens> {
    const accessTtl = Number(process.env.JWT_ACCESS_TTL ?? 900);
    const refreshTtl = Number(process.env.JWT_REFRESH_TTL ?? 604800);

    const accessToken = this.jwt.sign(payload, { expiresIn: accessTtl });

    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await tx.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken, expiresInSec: accessTtl };
  }
}
