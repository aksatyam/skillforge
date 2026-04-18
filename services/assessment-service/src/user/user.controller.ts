import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  InviteUserDtoSchema,
  UpdateUserDtoSchema,
  UserRoleSchema,
  type JwtClaims,
} from '@skillforge/shared-types';
import type { TenantId } from '@skillforge/tenant-guard';
import { z } from 'zod';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserService } from './user.service';

const ListUsersQueryDto = z.object({
  role: UserRoleSchema.optional(),
  q: z.string().max(120).optional(),
});

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Roles('hr_admin')
  @Get()
  list(@CurrentTenant() orgId: TenantId, @Query() query: unknown) {
    const q = ListUsersQueryDto.parse(query);
    return this.users.list(orgId, { role: q.role, query: q.q });
  }

  @Get(':id')
  get(@CurrentTenant() orgId: TenantId, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(orgId, id);
  }

  @Roles('hr_admin')
  @Post('invite')
  invite(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Body() body: unknown,
  ) {
    const dto = InviteUserDtoSchema.parse(body);
    return this.users.invite(orgId, user.sub, dto);
  }

  @Roles('hr_admin')
  @Post(':id/reissue-invite')
  reissueInvite(
    @CurrentTenant() orgId: TenantId,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.reissueInvite(orgId, id);
  }

  @Roles('hr_admin')
  @Patch(':id')
  update(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = UpdateUserDtoSchema.parse(body);
    return this.users.update(orgId, user.role, user.sub, id, dto);
  }

  @Roles('hr_admin')
  @Delete(':id')
  deactivate(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.deactivate(orgId, id, user.sub);
  }
}
