import { Module } from '@nestjs/common';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { ScoringService } from './scoring.service';

@Module({
  controllers: [AssessmentController],
  providers: [AssessmentService, ScoringService],
})
export class AssessmentModule {}
