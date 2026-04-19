import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { TenantGuard } from './common/guards/tenant.guard';
import { RbacGuard } from './common/guards/rbac.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { FrameworkModule } from './framework/framework.module';
import { CycleModule } from './cycle/cycle.module';
import { AssessmentModule } from './assessment/assessment.module';
import { ArtifactModule } from './artifact/artifact.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ExportModule } from './export/export.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: `${process.env.JWT_ACCESS_TTL ?? 900}s`,
        issuer: 'skillforge-assessment-service',
      },
    }),
    // Rate limiting — two named buckets so sensitive endpoints can
    // override with @Throttle({ short: { ... } }). Defaults (`default`)
    // cover the bulk of authed endpoints; `short` is tightened around
    // auth to blunt credential stuffing / bridge-secret brute force.
    // Applied globally via APP_GUARD below; @SkipThrottle() opts out.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
      { name: 'short', ttl: 60_000, limit: 10 },
    ]),
    HealthModule,
    AuthModule,
    UserModule,
    FrameworkModule,
    CycleModule,
    AssessmentModule,
    ArtifactModule,
    NotificationsModule,
    ExportModule,
    StatsModule,
  ],
  providers: [
    // Guard chain (order matters):
    //   1. ThrottlerGuard — drops over-limit traffic before auth work
    //                       (keeps credential stuffing from burning bcrypt cycles).
    //   2. JwtAuthGuard  — verifies JWT, attaches user/tenant to request
    //   3. TenantGuard   — compares JWT orgId vs URL orgId (ADR-007)
    //   4. RbacGuard     — checks @Roles() metadata
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RbacGuard },

    // Cross-cutting
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
