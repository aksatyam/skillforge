import { Module } from '@nestjs/common';
import { ArtifactController } from './artifact.controller';
import { ArtifactService } from './artifact.service';

@Module({
  controllers: [ArtifactController],
  providers: [ArtifactService],
})
export class ArtifactModule {}
