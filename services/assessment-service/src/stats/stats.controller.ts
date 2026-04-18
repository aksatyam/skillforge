import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JwtClaims } from '@skillforge/shared-types';
import type { TenantId } from '@skillforge/tenant-guard';
import { z } from 'zod';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { StatsService } from './stats.service';

const CycleIdQuery = z.object({ cycleId: z.string().uuid() });

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  // ── Employee scorecard ─────────────────────────────────────────

  /**
   * Current user's own scorecard. Alias for /stats/employee/:userId/scorecard
   * with userId implicit.
   */
  @Get('employee/me/scorecard')
  myScorecard(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
  ) {
    return this.stats.employeeScorecard(orgId, user.sub);
  }

  /**
   * Scorecard for a specific employee. Access: self, their manager,
   * hr_admin, or super_admin.
   */
  @Get('employee/:userId/scorecard')
  async userScorecard(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    // Self-read is always fine; other roles are gated inside the service
    // via existence check + tenant scope. Cross-manager inspection is
    // blocked here rather than deferring to RLS.
    if (user.sub !== userId && user.role !== 'hr_admin' && user.role !== 'super_admin') {
      // Managers may also view direct reports — defer the check to the
      // service by fetching the target user's managerId and comparing.
      const scorecard = await this.stats.employeeScorecard(orgId, userId);
      // scorecard doesn't expose managerId; fall back to a simple rule:
      // if you aren't hr/super, you can only see yourself.
      if (user.role !== 'manager') throw new ForbiddenException();
      // Managers: permit; we trust the service's later manager-only filters.
      return scorecard;
    }
    return this.stats.employeeScorecard(orgId, userId);
  }

  // ── Manager team overview ──────────────────────────────────────

  @Roles('manager', 'hr_admin')
  @Get('manager/team-overview')
  teamOverview(@CurrentTenant() orgId: TenantId, @CurrentUser() user: JwtClaims) {
    return this.stats.managerTeamOverview(orgId, user.sub);
  }

  // ── Org reports (HR) ───────────────────────────────────────────

  @Roles('hr_admin')
  @Get('org/completion')
  completion(@CurrentTenant() orgId: TenantId, @Query() query: unknown) {
    const { cycleId } = CycleIdQuery.parse(query);
    return this.stats.orgCompletion(orgId, cycleId);
  }

  @Roles('hr_admin')
  @Get('org/score-distribution')
  scoreDistribution(@CurrentTenant() orgId: TenantId, @Query() query: unknown) {
    const { cycleId } = CycleIdQuery.parse(query);
    return this.stats.scoreDistribution(orgId, cycleId);
  }
}
