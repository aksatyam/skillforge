import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  UpdateNotificationPrefsDtoSchema,
  type JwtClaims,
  type NotificationPrefs,
} from '@skillforge/shared-types';
import type { TenantId } from '@skillforge/tenant-guard';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationPreferencesService } from './preferences.service';

/**
 * /notifications/preferences — per-user, not role-gated.
 * Every authenticated user can read + PATCH their own preferences.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications/preferences')
export class NotificationPreferencesController {
  constructor(private readonly prefs: NotificationPreferencesService) {}

  @Get()
  get(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
  ): Promise<NotificationPrefs> {
    return this.prefs.get(orgId, user.sub);
  }

  @Patch()
  update(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Body() body: unknown,
  ): Promise<NotificationPrefs> {
    const dto = UpdateNotificationPrefsDtoSchema.parse(body);
    return this.prefs.update(orgId, user.sub, dto);
  }
}
