import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequestUploadUrlDtoSchema } from '@skillforge/shared-types';
import type { JwtClaims } from '@skillforge/shared-types';
import type { TenantId } from '@skillforge/tenant-guard';
import type { Request, Response } from 'express';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ArtifactService } from './artifact.service';

@ApiTags('artifacts')
@Controller('artifacts')
export class ArtifactController {
  constructor(private readonly artifacts: ArtifactService) {}

  @ApiBearerAuth()
  @Post('upload-url')
  async requestUploadUrl(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Body() body: unknown,
  ) {
    const dto = RequestUploadUrlDtoSchema.parse(body);
    return this.artifacts.requestUploadUrl(orgId, user.sub, dto);
  }

  @ApiBearerAuth()
  @Get('by-assessment/:assessmentId')
  async list(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.artifacts.list(orgId, user.sub, assessmentId);
  }

  /**
   * Raw-bytes upload endpoint. Public + HMAC-token-protected so the browser
   * can PUT the file directly using the token returned from /upload-url
   * (no JWT needed for this request). Sprint 3 replaces with S3 presigned URLs.
   */
  @Public()
  @Put(':id/upload')
  async upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token: string,
    @Headers('content-type') contentType: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);
    const updated = await this.artifacts.acceptUpload(id, token, buffer, contentType);
    res.status(200).json(updated);
  }
}
