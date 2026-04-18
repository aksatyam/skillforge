import { Controller, Get } from '@nestjs/common';
import { prisma } from '@skillforge/db';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  async check() {
    // Quick DB ping
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }

    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'assessment-service',
      version: process.env.npm_package_version ?? '0.1.0',
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { database: dbOk },
    };
  }
}
