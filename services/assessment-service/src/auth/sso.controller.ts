import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import * as crypto from 'node:crypto';
import { Public } from '../common/decorators/public.decorator';
import {
  AuthSsoService,
  SsoExchangeDtoSchema,
} from './auth.sso.service';

/**
 * Minimum bridge-secret entropy in production. 32 characters ≈ 192 bits
 * when drawn from a ~64-char alphabet — far above any offline-brute-force
 * horizon. In development we relax to 8 so the sample `.env.example`
 * value works, but NODE_ENV=production forces the prod floor.
 */
const PROD_BRIDGE_SECRET_MIN = 32;
const DEV_BRIDGE_SECRET_MIN = 8;

/**
 * POST /auth/sso/exchange
 *
 * Called by the Next.js BFF callback route AFTER it has exchanged the
 * Keycloak authorization code for Keycloak tokens. Protected by a
 * shared secret header (`x-sso-bridge-secret`) — NOT by a JWT, because
 * at this point no SkillForge session exists yet. The BFF is the only
 * caller, and that secret is set in both services' env.
 *
 * On success returns AuthTokens (same shape as POST /auth/login), which
 * the BFF writes into `sf_access` / `sf_refresh` cookies.
 *
 * PHASE 3 TODO: SAML path will mount alongside as POST /auth/sso/saml-ack.
 */
@ApiTags('auth')
@Controller('auth/sso')
export class SsoController {
  constructor(private readonly ssoService: AuthSsoService) {}

  @Public()
  // Same tight bucket as /auth/login — the bridge secret is the only
  // gate here, and rate-limiting blunts any online brute-force attempt
  // from an attacker who can reach the assessment-service directly.
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @Post('exchange')
  @HttpCode(200)
  async exchange(
    @Headers('x-sso-bridge-secret') bridgeSecret: string | undefined,
    @Body() body: unknown,
  ) {
    this.assertBridgeSecret(bridgeSecret);

    const parsed = SsoExchangeDtoSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }

    return this.ssoService.exchange(parsed.data);
  }

  /**
   * Constant-time compare against env secret. Throws 403 if missing or
   * mismatched. In production we additionally require >=32 chars so a
   * low-entropy dev secret can't leak into a prod deploy silently.
   */
  private assertBridgeSecret(header: string | undefined): void {
    const expected = process.env.SSO_BRIDGE_SECRET;
    const minLen =
      process.env.NODE_ENV === 'production'
        ? PROD_BRIDGE_SECRET_MIN
        : DEV_BRIDGE_SECRET_MIN;
    if (!expected || expected.length < minLen) {
      // Never accept SSO if the server isn't configured — this is a
      // prod-wide fail-closed. Dev default in .env.example keeps the
      // flow working locally (>=8 chars). Prod ops must set a 32+ char
      // secret at deploy time.
      throw new ForbiddenException('SSO bridge secret not configured');
    }
    if (!header || !timingSafeEq(header, expected)) {
      throw new ForbiddenException('Invalid SSO bridge secret');
    }
  }
}

function timingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
