import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequestUploadUrlDtoSchema } from '@skillforge/shared-types';
import type { JwtClaims } from '@skillforge/shared-types';
import type { TenantId } from '@skillforge/tenant-guard';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ArtifactService } from './artifact.service';

@ApiTags('artifacts')
@ApiBearerAuth()
@Controller('artifacts')
export class ArtifactController {
  constructor(private readonly artifacts: ArtifactService) {}

  @Post('upload-url')
  async requestUploadUrl(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Body() body: unknown,
  ) {
    const dto = RequestUploadUrlDtoSchema.parse(body);
    return this.artifacts.requestUploadUrl(orgId, user.sub, dto);
  }
}
