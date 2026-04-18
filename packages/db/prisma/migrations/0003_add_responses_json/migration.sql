-- Sprint 2: self-assessment responses (draft-save + submitted per-dimension scores)
ALTER TABLE "assessments" ADD COLUMN "responses_json" JSONB;

COMMENT ON COLUMN "assessments"."responses_json" IS
  'Shape: {self?: {responses: [{dimension, score, comment?}], savedAt, submittedAt?}, manager?: {same}}. '
  'Used for draft auto-save + per-dimension final scores. selfScore/managerScore columns hold the aggregated number.';
