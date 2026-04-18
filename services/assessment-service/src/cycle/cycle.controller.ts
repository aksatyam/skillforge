import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateCycleDtoSchema, CycleStatusSchema } from '@skillforge/shared-types';
import { z } from 'zod';
import type { TenantId } from '@skillforge/tenant-guard';
import type { JwtClaims } from '@skillforge/shared-types';

import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CycleService } from './cycle.service';

const TransitionDto = z.object({ status: CycleStatusSchema });

@ApiTags('cycles')
@ApiBearerAuth()
@Controller('cycles')
export class CycleController {
  constructor(private readonly cycles: CycleService) {}

  @Get()
  list(@CurrentTenant() orgId: TenantId) {
    return this.cycles.list(orgId);
  }

  @Get(':id')
  get(@CurrentTenant() orgId: TenantId, @Param('id', ParseUUIDPipe) id: string) {
    return this.cycles.get(orgId, id);
  }

  @Get(':id/progress')
  progress(
    @CurrentTenant() orgId: TenantId,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cycles.getProgress(orgId, id);
  }

  @Roles('hr_admin')
  @Post()
  create(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Body() body: unknown,
  ) {
    const dto = CreateCycleDtoSchema.parse(body);
    return this.cycles.create(orgId, user.sub, dto);
  }

  @Roles('hr_admin')
  @Patch(':id/status')
  transition(
    @CurrentTenant() orgId: TenantId,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { status } = TransitionDto.parse(body);
    return this.cycles.transition(orgId, id, status);
  }

  // ── Sprint 3 Feature #16 — finalize + close ────────────────────

  @Roles('hr_admin')
  @Post(':id/finalize-all')
  finalizeAll(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cycles.bulkFinalize(orgId, id, user.sub);
  }

  @Roles('hr_admin')
  @Post(':id/close')
  close(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cycles.closeCycle(orgId, id, user.sub);
  }

  @Roles('hr_admin')
  @Post(':id/assessments/:assessmentId/finalize')
  finalizeOne(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseUUIDPipe) cycleId: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.cycles.finalizeAssessment(orgId, cycleId, assessmentId, user.sub);
  }
}
