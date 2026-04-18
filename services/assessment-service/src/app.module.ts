import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

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
    HealthModule,
    AuthModule,
    UserModule,
    FrameworkModule,
    CycleModule,
    AssessmentModule,
    ArtifactModule,
    NotificationsModule,
  ],
  providers: [
    // Guard chain (order matters):
    //   1. JwtAuthGuard  — verifies JWT, attaches user/tenant to request
    //   2. TenantGuard   — compares JWT orgId vs URL orgId (ADR-007)
    //   3. RbacGuard     — checks @Roles() metadata
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RbacGuard },

    // Cross-cutting
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
