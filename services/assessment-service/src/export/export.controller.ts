import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { TenantId } from '@skillforge/tenant-guard';
import {
  ExportTemplateSchema,
  UpsertExportTemplateDtoSchema,
} from '@skillforge/shared-types';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ExportService } from './export.service';

/**
 * CSV export + per-tenant template catalog.
 *
 * Routes (all require `hr_admin`):
 *   GET    /cycles/:cycleId/export.csv?templateId=...  stream CSV, honoring template
 *   GET    /export/templates                           list built-ins + custom
 *   PUT    /export/templates/:id                       upsert a custom template
 *   DELETE /export/templates/:id                       delete a custom template
 *
 * Template mutations live under /export/templates (not /cycles) because they
 * are org-scoped config, not cycle-scoped data. This keeps the resource tree
 * clean for the OpenAPI spec and avoids accidentally leaking template IDs
 * into cycle-level audit trails.
 */
@ApiTags('exports')
@ApiBearerAuth()
@Controller()
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  /**
   * Stream the CSV export for a cycle. AuditLogInterceptor captures the
   * request at the HTTP layer. Attachment filename encodes cycle slug +
   * date so multiple downloads don't collide. `templateId` is optional —
   * falls back to the tenant's configured default.
   */
  @Roles('hr_admin')
  @Get('cycles/:cycleId/export.csv')
  async exportCsv(
    @CurrentTenant() orgId: TenantId,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Query('templateId') templateId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, csv } = await this.exports.exportCycleCsv(
      orgId,
      cycleId,
      templateId,
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/"/g, '')}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(csv);
  }

  // ── Template CRUD ──────────────────────────────────────────────────

  @Roles('hr_admin')
  @Get('export/templates')
  async listTemplates(@CurrentTenant() orgId: TenantId) {
    return this.exports.listTemplates(orgId);
  }

  /**
   * Upsert a custom template. We re-parse with the full schema (coercing
   * `builtin` to its default) so the service contract is unambiguous — the
   * service is allowed to assume a fully-valid ExportTemplate.
   */
  @Roles('hr_admin')
  @Put('export/templates/:id')
  async upsertTemplate(
    @CurrentTenant() orgId: TenantId,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    // First sanity-check the DTO (no `builtin` allowed from clients).
    const parsedDto = UpsertExportTemplateDtoSchema.safeParse(body);
    if (!parsedDto.success) {
      throw new BadRequestException(
        parsedDto.error.issues.map((i) => i.message).join('; '),
      );
    }
    // Re-run through the full schema to get the defaulted `builtin:false`.
    const parsed = ExportTemplateSchema.parse(parsedDto.data);
    return this.exports.upsertTemplate(orgId, id, parsed);
  }

  @Roles('hr_admin')
  @Delete('export/templates/:id')
  @HttpCode(204)
  async deleteTemplate(
    @CurrentTenant() orgId: TenantId,
    @Param('id') id: string,
  ): Promise<void> {
    await this.exports.deleteTemplate(orgId, id);
  }
}
