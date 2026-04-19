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
import * as crypto from 'node:crypto';
import { Public } from '../common/decorators/public.decorator';
import {
  AuthSsoService,
  SsoExchangeDtoSchema,
} from './auth.sso.service';

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
   * mismatched. Kept separate so the unit test can inject it directly.
   */
  private assertBridgeSecret(header: string | undefined): void {
    const expected = process.env.SSO_BRIDGE_SECRET;
    if (!expected || expected.length < 8) {
      // Never accept SSO if the server isn't configured — this is a
      // prod-wide fail-closed. Dev default in .env.example keeps the
      // flow working locally.
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
