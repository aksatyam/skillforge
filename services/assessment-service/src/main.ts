import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = Number(process.env.PORT_ASSESSMENT ?? 4001);

  // Security hardening
  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
    credentials: true,
  });

  // Strict DTO validation — reject unknown fields
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger — disabled under tsx dev (esbuild doesn't emit the same
  // decorator metadata as tsc, which @nestjs/swagger requires).
  // Re-enable in prod builds where `nest build` uses tsc.
  if (process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('SkillForge Assessment Service')
      .setDescription('Assessment lifecycle, scoring, artifacts')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  await app.listen(port);
  Logger.log(`🚀 assessment-service on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
