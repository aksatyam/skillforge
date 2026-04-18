import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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

const RefreshDto = z.object({ refreshToken: z.string().min(32) });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown) {
    const dto = LoginDtoSchema.parse(body);
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
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
