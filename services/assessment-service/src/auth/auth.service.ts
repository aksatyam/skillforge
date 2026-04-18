import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prisma } from '@skillforge/db';
import type { AuthTokens, MeResponse } from '@skillforge/shared-types';
import { withTenant, TenantId } from '@skillforge/tenant-guard';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  /**
   * Dev/Phase-1 login: email + password → JWT.
   * In Phase 2 this is replaced by Keycloak OIDC; this service keeps issuing
   * our own JWTs with tenant + role claims baked in.
   */
  async login(email: string, password: string): Promise<AuthTokens> {
    // No tenant context at login — use a raw query so RLS doesn't block.
    // This is the ONE place we bypass tenant isolation for reads; it's safe
    // because email+password is the narrowest possible query.
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        org_id: string;
        email: string;
        role: string;
        password_hash: string | null;
        invite_accepted_at: Date | null;
      }>
    >(
      `SELECT id, org_id, email, role::text as role, password_hash, invite_accepted_at
         FROM users
        WHERE email = $1 AND deleted_at IS NULL
        LIMIT 1`,
      email,
    );

    // Uniform error to avoid email enumeration
    const invalid = new UnauthorizedException('Invalid credentials');
    if (rows.length === 0) throw invalid;
    const u = rows[0];
    if (!u.password_hash) throw invalid;
    if (!u.invite_accepted_at) {
      throw new UnauthorizedException('Invite not yet accepted — please set your password first');
    }

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) throw invalid;

    // Stamp last_login_at (best-effort, outside tenant context)
    await prisma.$executeRawUnsafe(
      `UPDATE users SET last_login_at = now() WHERE id = $1`,
      u.id,
    );

    return this.issueTokens({
      sub: u.id,
      orgId: u.org_id,
      email: u.email,
      role: u.role,
    });
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await prisma.refreshToken.update({
      where: { tokenHash: hash },
      data: { revokedAt: new Date() },
    });

    const [u] = await prisma.$queryRawUnsafe<
      Array<{ id: string; org_id: string; email: string; role: string }>
    >(
      `SELECT id, org_id, email, role::text as role FROM users WHERE id = $1 AND deleted_at IS NULL`,
      row.userId,
    );
    if (!u) throw new UnauthorizedException();

    return this.issueTokens({
      sub: u.id,
      orgId: u.org_id,
      email: u.email,
      role: u.role,
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Returns the current authenticated user with their tenant + org name.
   * Used by the frontend shell to render the sidebar and role-gated nav.
   */
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
   * Generates a one-time invite token + hash for a freshly-created user row.
   * Returns the RAW token to the caller (to email/share) and persists only the
   * SHA-256 hash on the user row.
   */
  async issueInviteToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.$executeRawUnsafe(
      `UPDATE users
          SET invite_token_hash = $1,
              invite_expires_at = $2,
              invite_accepted_at = NULL
        WHERE id = $3`,
      hash,
      expiresAt,
      userId,
    );

    return { token, expiresAt };
  }

  /**
   * User clicks invite link, submits token + new password.
   * Validates, sets password_hash, marks invite accepted, issues JWTs.
   */
  async acceptInvite(token: string, password: string): Promise<AuthTokens> {
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        org_id: string;
        email: string;
        role: string;
        invite_expires_at: Date | null;
        invite_accepted_at: Date | null;
      }>
    >(
      `SELECT id, org_id, email, role::text as role, invite_expires_at, invite_accepted_at
         FROM users
        WHERE invite_token_hash = $1 AND deleted_at IS NULL
        LIMIT 1`,
      hash,
    );

    if (rows.length === 0) throw new BadRequestException('Invalid or expired invite');
    const u = rows[0];
    if (u.invite_accepted_at) throw new BadRequestException('Invite already accepted');
    if (!u.invite_expires_at || u.invite_expires_at < new Date()) {
      throw new BadRequestException('Invite has expired — ask HR to re-issue');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$executeRawUnsafe(
      `UPDATE users
          SET password_hash = $1,
              invite_accepted_at = now(),
              invite_token_hash = NULL,
              invite_expires_at = NULL
        WHERE id = $2`,
      passwordHash,
      u.id,
    );

    return this.issueTokens({
      sub: u.id,
      orgId: u.org_id,
      email: u.email,
      role: u.role,
    });
  }

  // ── JWT issuance ───────────────────────────────────────────────

  private async issueTokens(payload: {
    sub: string;
    orgId: string;
    email: string;
    role: string;
  }): Promise<AuthTokens> {
    const accessTtl = Number(process.env.JWT_ACCESS_TTL ?? 900);
    const refreshTtl = Number(process.env.JWT_REFRESH_TTL ?? 604800);

    const accessToken = this.jwt.sign(payload, { expiresIn: accessTtl });

    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await prisma.refreshToken.create({
      data: {
        userId: payload.sub,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken, expiresInSec: accessTtl };
  }
}
