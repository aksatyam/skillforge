import { Injectable, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { prismaAdmin, Prisma, UserRole } from '@skillforge/db';
import type { AuthTokens } from '@skillforge/shared-types';
import * as crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

/**
 * PHASE 3 TODO: SAML 2.0 support. This service is OIDC-only per ADR-009.
 *
 * OIDC bridge between the Next BFF callback and our own SkillForge
 * short-lived JWTs. The BFF runs the authorization-code + PKCE dance,
 * then POSTs { idToken, accessToken, refreshToken, issuer } to
 *   /auth/sso/exchange
 * guarded by a shared secret header. We:
 *
 *   1. Verify the idToken's signature against Keycloak's JWKS for the
 *      given issuer (cached in-process for ~10 min).
 *   2. Validate and extract claims (sub, email, name, preferred_username,
 *      realm_access.roles) with zod.
 *   3. Resolve the tenant from the issuer by looking up
 *      `organization.settings_json.sso.issuer` — first org with a match.
 *   4. Find the user by authProviderId=sub, then email within that tenant.
 *      If still missing and `settings_json.sso.autoProvision === true`,
 *      create a new user (role=employee, roleFamily from claim or
 *      'Unassigned'). Otherwise refuse.
 *   5. Issue our OWN SkillForge access + refresh tokens (same shape as
 *      password login) via `issueTokensInTx` behaviour mirrored here.
 *
 * All DB work happens with `prismaAdmin` (BYPASSRLS). This is a
 * pre-tenant flow — we don't yet have a tenant-scoped client to hand
 * the data to. Matches the AuthService pattern.
 */

// ── Claim schema ────────────────────────────────────────────────────
const IdTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  preferred_username: z.string().optional(),
  iss: z.string().url(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  realm_access: z.object({ roles: z.array(z.string()) }).optional(),
  groups: z.array(z.string()).optional(),
  // custom Keycloak claim — optional team/role family mapper
  skillforge_role_family: z.string().optional(),
});

type IdTokenClaims = z.infer<typeof IdTokenClaimsSchema>;

// ── Request DTO ─────────────────────────────────────────────────────
export const SsoExchangeDtoSchema = z.object({
  idToken: z.string().min(32),
  accessToken: z.string().min(32),
  refreshToken: z.string().min(32),
  issuer: z.string().url(),
});
export type SsoExchangeDto = z.infer<typeof SsoExchangeDtoSchema>;

// ── Organisation SSO config schema (read from settings_json.sso) ────
//
// `audience` is the OIDC `aud` claim we require in the idToken — this
// is Keycloak's client_id by default. Stored per-tenant so two realms
// can use the same SkillForge instance without sharing an audience;
// falls back to KEYCLOAK_CLIENT_ID env for single-tenant deploys.
const OrgSsoConfigSchema = z.object({
  issuer: z.string().url(),
  audience: z.string().min(1).optional(),
  autoProvision: z.boolean().default(false),
  defaultRoleFamily: z.string().default('Unassigned'),
});
type OrgSsoConfig = z.infer<typeof OrgSsoConfigSchema>;

// ── JWKS cache (per issuer) ─────────────────────────────────────────
const JWKS_TTL_MS = 10 * 60 * 1000;
type JwksEntry = {
  jwks: ReturnType<typeof createRemoteJWKSet>;
  expiresAt: number;
};

@Injectable()
export class AuthSsoService {
  private readonly logger = new Logger(AuthSsoService.name);
  private readonly jwksCache = new Map<string, JwksEntry>();

  constructor(private readonly jwt: JwtService) {}

  async exchange(dto: SsoExchangeDto): Promise<AuthTokens> {
    // Resolve tenant FIRST (lightweight DB scan) so we know which
    // audience to assert when verifying the idToken signature. If we
    // verified without aud we'd accept any token Keycloak ever minted
    // for this issuer — including tokens from unrelated client apps.
    const org = await this.findOrgByIssuer(dto.issuer);
    if (!org) {
      throw new UnauthorizedException(`No tenant configured for issuer ${dto.issuer}`);
    }

    const ssoConfig = this.parseOrgSsoConfig(org.settingsJson);
    if (!ssoConfig) {
      throw new UnauthorizedException(`Tenant ${org.id} has no SSO configuration`);
    }

    const expectedAudience =
      ssoConfig.audience ?? process.env.KEYCLOAK_CLIENT_ID;
    if (!expectedAudience) {
      // Fail closed: no audience to check → refuse rather than accept
      // anything. Admins must set either settings_json.sso.audience or
      // KEYCLOAK_CLIENT_ID. (Pre-audit this silently skipped the check.)
      this.logger.error(
        `SSO tenant ${org.id} has no audience configured and KEYCLOAK_CLIENT_ID is unset — refusing exchange`,
      );
      throw new UnauthorizedException('SSO audience not configured');
    }

    const claims = await this.verifyIdToken(dto.idToken, dto.issuer, expectedAudience);

    const user = await this.findOrProvisionUser(org.id, claims, ssoConfig);

    return this.issueSkillforgeTokens({
      sub: user.id,
      orgId: user.orgId,
      email: user.email,
      role: user.role,
    });
  }

  // ── idToken verification ─────────────────────────────────────────
  private async verifyIdToken(
    idToken: string,
    issuer: string,
    audience: string,
  ): Promise<IdTokenClaims> {
    const jwks = this.getJwks(issuer);
    let payload: unknown;
    try {
      const result = await jwtVerify(idToken, jwks, {
        issuer,
        audience,
        // jose enforces `exp` by default; `nbf` is ignored when absent.
      });
      payload = result.payload;
    } catch (err) {
      // Keep the log terse (we don't want to leak token bytes). `err.code`
      // from jose tells us which check failed — issuer / audience /
      // signature / expiry — useful when debugging misconfigured realms.
      const code =
        err instanceof Error && 'code' in err
          ? (err as { code: string }).code
          : 'unknown';
      this.logger.warn(
        `SSO idToken verify failed: code=${code} msg=${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      throw new UnauthorizedException('idToken signature or issuer invalid');
    }

    const parsed = IdTokenClaimsSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn(`SSO idToken claims shape invalid: ${parsed.error.message}`);
      throw new UnauthorizedException('idToken claims invalid');
    }
    return parsed.data;
  }

  private getJwks(issuer: string): ReturnType<typeof createRemoteJWKSet> {
    const now = Date.now();
    const hit = this.jwksCache.get(issuer);
    if (hit && hit.expiresAt > now) return hit.jwks;

    const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
    this.jwksCache.set(issuer, { jwks, expiresAt: now + JWKS_TTL_MS });
    return jwks;
  }

  // ── Tenant resolution ────────────────────────────────────────────
  private async findOrgByIssuer(
    issuer: string,
  ): Promise<{ id: string; settingsJson: Prisma.JsonValue } | null> {
    // We can't easily SQL-filter JSON across orgs without a helper — the
    // first-pass scan is fine while tenant count is small. If the tenant
    // list grows we can index `settings_json->sso->>'issuer'` server-side.
    const orgs = await prismaAdmin.organization.findMany({
      where: { deletedAt: null },
      select: { id: true, settingsJson: true },
    });
    for (const org of orgs) {
      const cfg = this.parseOrgSsoConfig(org.settingsJson);
      if (cfg && cfg.issuer === issuer) return org;
    }
    return null;
  }

  private parseOrgSsoConfig(settingsJson: Prisma.JsonValue): OrgSsoConfig | null {
    if (!settingsJson || typeof settingsJson !== 'object' || Array.isArray(settingsJson)) {
      return null;
    }
    const sso = (settingsJson as Record<string, unknown>).sso;
    if (!sso) return null;
    const parsed = OrgSsoConfigSchema.safeParse(sso);
    return parsed.success ? parsed.data : null;
  }

  // ── User lookup / provisioning ───────────────────────────────────
  private async findOrProvisionUser(
    orgId: string,
    claims: IdTokenClaims,
    ssoConfig: OrgSsoConfig,
  ): Promise<{ id: string; orgId: string; email: string; role: UserRole }> {
    // 1. Match by authProviderId=sub (the canonical Keycloak subject)
    const bySub = await prismaAdmin.user.findFirst({
      where: { authProviderId: claims.sub, orgId, deletedAt: null },
      select: { id: true, orgId: true, email: true, role: true },
    });
    if (bySub) {
      await this.touchLastLogin(bySub.id);
      return bySub;
    }

    // 2. Match by email within the tenant (covers first-login migration
    //    where a local password user switches to SSO).
    if (claims.email) {
      const byEmail = await prismaAdmin.user.findFirst({
        where: {
          email: claims.email,
          orgId,
          deletedAt: null,
        },
        select: { id: true, orgId: true, email: true, role: true, authProviderId: true },
      });
      if (byEmail) {
        // Stamp the sub so next login is a direct hit
        if (!byEmail.authProviderId) {
          await prismaAdmin.user.update({
            where: { id: byEmail.id },
            data: { authProviderId: claims.sub },
          });
        }
        await this.touchLastLogin(byEmail.id);
        return {
          id: byEmail.id,
          orgId: byEmail.orgId,
          email: byEmail.email,
          role: byEmail.role,
        };
      }
    }

    // 3. Auto-provision if tenant permits it
    if (!ssoConfig.autoProvision) {
      throw new ForbiddenException(
        'SSO user not recognised and auto-provisioning is disabled for this tenant',
      );
    }
    if (!claims.email) {
      throw new UnauthorizedException('SSO provider did not return an email claim');
    }

    // `??` vs `||`: `.trim()` always returns a string, so `""` never
    // triggers `??` — we have to use `||` so an empty string falls
    // through to preferred_username / email. (Audit L2.)
    const composedName = [claims.given_name, claims.family_name]
      .filter(Boolean)
      .join(' ')
      .trim();
    const name =
      claims.name ||
      composedName ||
      claims.preferred_username ||
      claims.email;

    const created = await prismaAdmin.user.create({
      data: {
        orgId,
        email: claims.email,
        name: name.length > 0 ? name : claims.email,
        roleFamily: claims.skillforge_role_family ?? ssoConfig.defaultRoleFamily,
        designation: claims.preferred_username ?? 'SSO User',
        role: UserRole.employee,
        authProviderId: claims.sub,
        inviteAcceptedAt: new Date(),
        lastLoginAt: new Date(),
      },
      select: { id: true, orgId: true, email: true, role: true },
    });
    this.logger.log(
      `SSO auto-provisioned user ${created.id} (${created.email}) in org ${orgId}`,
    );
    return created;
  }

  private async touchLastLogin(userId: string): Promise<void> {
    await prismaAdmin.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  // ── Token issuance ───────────────────────────────────────────────
  /**
   * Mirrors AuthService.issueTokensInTx, but inlined here so we don't
   * need to expose a protected helper across services and so the SSO
   * path can evolve independently (e.g., add `auth_method: 'sso'`
   * claim later without touching password login).
   */
  private async issueSkillforgeTokens(payload: {
    sub: string;
    orgId: string;
    email: string;
    role: string;
  }): Promise<AuthTokens> {
    const accessTtl = Number(process.env.JWT_ACCESS_TTL ?? 900);
    const refreshTtl = Number(process.env.JWT_REFRESH_TTL ?? 604800);

    return prismaAdmin.$transaction(async (tx) => {
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
    });
  }
}
