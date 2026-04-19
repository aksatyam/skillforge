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
   * Mint a short-lived download URL the browser can follow. Works in
   * both modes: local returns a relative `/artifacts/:id/download?token=`
   * URL that hits {@link download}, s3 returns an absolute presigned URL
   * straight to the bucket.
   */
  @ApiBearerAuth()
  @Get(':id/download-url')
  async requestDownloadUrl(
    @CurrentTenant() orgId: TenantId,
    @CurrentUser() user: JwtClaims,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.artifacts.requestDownloadUrl(orgId, user.sub, id);
  }

  /**
   * Raw-bytes upload endpoint. Public + HMAC-token-protected so the
   * browser can PUT the file directly using the token returned from
   * `/upload-url` (no JWT needed for this request). Returns 400 when
   * STORAGE_MODE=s3 because the browser PUTs directly to the bucket in
   * that mode.
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

  /**
   * Raw-bytes download endpoint. Public + HMAC-token-protected — the
   * token is minted by {@link requestDownloadUrl} after the authed role
   * check. Local mode only; the route is present but returns 400 in s3
   * mode because the browser is redirected to the presigned S3 URL.
   */
  @Public()
  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName, mimeType } = await this.artifacts.streamLocalDownload(
      id,
      token,
    );
    res.setHeader('content-type', mimeType);
    res.setHeader(
      'content-disposition',
      `attachment; filename="${fileName.replace(/["\r\n]/g, '_')}"`,
    );
    res.status(200).send(buffer);
  }
}
