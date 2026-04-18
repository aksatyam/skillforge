import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateFrameworkDtoSchema,
  UpsertRoleMappingDtoSchema,
  type JwtClaims,
} from '@skillforge/shared-types';
import type { TenantId } from '@skillforge/tenant-guard';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { FrameworkService } from './framework.service';

@ApiTags('frameworks')
@ApiBearerAuth()
@Controller('frameworks')
export class FrameworkController {
  constructor(private readonly frameworks: FrameworkService) {}

  @Get()
  list(@CurrentTenant() orgId: TenantId) {
    return this.frameworks.list(orgId);
  }

  @Get(':id')
  get(@CurrentTenant() orgId: TenantId, @Param('id', ParseUUIDPipe) id: string) {
    return this.frameworks.get(orgId, id);
  }

  @Roles('hr_admin')
  @Post()
  create(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Body() body: unknown,
  ) {
    const dto = CreateFrameworkDtoSchema.parse(body);
    return this.frameworks.create(orgId, user.sub, dto);
  }

  @Roles('hr_admin')
  @Put(':id/role-mappings')
  upsertRoleMapping(
    @CurrentTenant() orgId: TenantId,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = UpsertRoleMappingDtoSchema.parse(body);
    return this.frameworks.upsertRoleMapping(orgId, id, dto);
  }

  @Roles('hr_admin')
  @Delete(':id/role-mappings/:roleFamily')
  deleteRoleMapping(
    @CurrentTenant() orgId: TenantId,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleFamily') roleFamily: string,
  ) {
    return this.frameworks.deleteRoleMapping(orgId, id, roleFamily);
  }

  @Roles('hr_admin')
  @Post(':id/publish')
  publish(@CurrentTenant() orgId: TenantId, @Param('id', ParseUUIDPipe) id: string) {
    return this.frameworks.publish(orgId, id);
  }

  @Roles('hr_admin')
  @Post(':id/archive')
  archive(@CurrentTenant() orgId: TenantId, @Param('id', ParseUUIDPipe) id: string) {
    return this.frameworks.archive(orgId, id);
  }
}
