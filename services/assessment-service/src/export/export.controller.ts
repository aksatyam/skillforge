import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { TenantId } from '@skillforge/tenant-guard';

import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ExportService } from './export.service';

@ApiTags('exports')
@ApiBearerAuth()
@Controller('cycles')
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  /**
   * Stream the CSV export for a cycle. AuditLogInterceptor captures the
   * request at the HTTP layer. Attachment filename encodes cycle slug +
   * date so multiple downloads don't collide.
   */
  @Roles('hr_admin')
  @Get(':cycleId/export.csv')
  async exportCsv(
    @CurrentTenant() orgId: TenantId,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, csv } = await this.exports.exportCycleCsv(orgId, cycleId);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/"/g, '')}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(csv);
  }
}
