import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AcceptInviteDtoSchema,
  LoginDtoSchema,
  type JwtClaims,
  type MeResponse,
} from '@skillforge/shared-types';
import type { TenantId } from '@skillforge/tenant-guard';
import { z } from 'zod';
import { Public } from '../common/decorators/public.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';

// Tight bucket for credential-bearing endpoints: the `short` limiter
// defined in AppModule (10 req/min/IP). Brute-forcing a login or
// refresh secret past that ceiling requires distributing across IPs,
// which is cheap to alert on downstream.
const AUTH_THROTTLE = { short: { limit: 10, ttl: 60_000 } } as const;

const RefreshDto = z.object({ refreshToken: z.string().min(32) });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown) {
    const dto = LoginDtoSchema.parse(body);
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: unknown) {
    const dto = RefreshDto.parse(body);
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: unknown) {
    const dto = RefreshDto.parse(body);
    await this.auth.logout(dto.refreshToken);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('accept-invite')
  @HttpCode(200)
  async acceptInvite(@Body() body: unknown) {
    const dto = AcceptInviteDtoSchema.parse(body);
    return this.auth.acceptInvite(dto.token, dto.password);
  }

  @ApiBearerAuth()
  @Get('me')
  async me(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
  ): Promise<MeResponse> {
    return this.auth.me(orgId, user.sub);
  }
}
