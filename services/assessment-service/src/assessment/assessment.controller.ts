import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  SaveSelfDraftDtoSchema,
  SubmitSelfAssessmentDtoSchema,
  SubmitManagerAssessmentDtoSchema,
} from '@skillforge/shared-types';
import type { JwtClaims } from '@skillforge/shared-types';
import type { TenantId } from '@skillforge/tenant-guard';
import { z } from 'zod';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AssessmentService } from './assessment.service';

const HrListQuery = z.object({ cycleId: z.string().uuid() });

@ApiTags('assessments')
@ApiBearerAuth()
@Controller('assessments')
export class AssessmentController {
  constructor(private readonly assessments: AssessmentService) {}

  @Get('me')
  listMine(@CurrentTenant() orgId: TenantId, @CurrentUser() user: JwtClaims) {
    return this.assessments.listForUser(orgId, user.sub);
  }

  @Get(':id')
  async get(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessments.getById(orgId, user.sub, id);
  }

  @Roles('manager', 'hr_admin')
  @Get('team/list')
  listTeam(@CurrentTenant() orgId: TenantId, @CurrentUser() user: JwtClaims) {
    return this.assessments.listForManager(orgId, user.sub);
  }

  @Roles('hr_admin')
  @Get('hr/list')
  listHr(@CurrentTenant() orgId: TenantId, @Query() query: unknown) {
    const { cycleId } = HrListQuery.parse(query);
    return this.assessments.listForHr(orgId, cycleId);
  }

  @Post('self/draft')
  saveSelfDraft(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Body() body: unknown,
  ) {
    const dto = SaveSelfDraftDtoSchema.parse(body);
    return this.assessments.saveSelfDraft(orgId, user.sub, dto);
  }

  @Post('self/submit')
  submitSelf(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Body() body: unknown,
  ) {
    const dto = SubmitSelfAssessmentDtoSchema.parse(body);
    return this.assessments.submitSelf(orgId, user.sub, dto);
  }

  @Roles('manager', 'hr_admin')
  @Post('manager/submit')
  submitManager(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Body() body: unknown,
  ) {
    const dto = SubmitManagerAssessmentDtoSchema.parse(body);
    return this.assessments.submitManager(orgId, user.sub, dto);
  }
}
