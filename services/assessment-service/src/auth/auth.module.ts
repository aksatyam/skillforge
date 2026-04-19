import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthSsoService } from './auth.sso.service';
import { SsoController } from './sso.controller';

@Module({
  controllers: [AuthController, SsoController],
  providers: [AuthService, AuthSsoService],
  exports: [AuthService, AuthSsoService],
})
export class AuthModule {}
