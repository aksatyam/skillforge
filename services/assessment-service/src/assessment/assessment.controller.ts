import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  SubmitSelfAssessmentDtoSchema,
  SubmitManagerAssessmentDtoSchema,
} from '@skillforge/shared-types';
import type { JwtClaims } from '@skillforge/shared-types';
import type { TenantId } from '@skillforge/tenant-guard';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AssessmentService } from './assessment.service';

@ApiTags('assessments')
@ApiBearerAuth()
@Controller('assessments')
export class AssessmentController {
  constructor(private readonly assessments: AssessmentService) {}

  @Get('me')
  listMine(@CurrentTenant() orgId: TenantId, @CurrentUser() user: JwtClaims) {
    return this.assessments.listForUser(orgId, user.sub);
  }

  @Roles('manager', 'hr_admin')
  @Get('team')
  listTeam(@CurrentTenant() orgId: TenantId, @CurrentUser() user: JwtClaims) {
    return this.assessments.listForManager(orgId, user.sub);
  }

  @Post('self')
  submitSelf(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Body() body: unknown,
  ) {
    const dto = SubmitSelfAssessmentDtoSchema.parse(body);
    return this.assessments.submitSelf(orgId, user.sub, dto);
  }

  @Roles('manager', 'hr_admin')
  @Post('manager')
  submitManager(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Body() body: unknown,
  ) {
    const dto = SubmitManagerAssessmentDtoSchema.parse(body);
    return this.assessments.submitManager(orgId, user.sub, dto);
  }
}
