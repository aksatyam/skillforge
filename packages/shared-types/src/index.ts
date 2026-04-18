/**
 * @skillforge/shared-types
 *
 * Types + zod schemas shared between frontend and backend.
 * Source of truth for DTO shapes; reused for react-hook-form + class-validator.
 */
import { z } from 'zod';

export const UserRoleSchema = z.enum([
  'employee',
  'manager',
  'hr_admin',
  'ai_champion',
  'leadership',
  'super_admin',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const AssessmentStatusSchema = z.enum([
  'not_started',
  'self_submitted',
  'manager_in_progress',
  'peer_submitted',
  'ai_analyzed',
  'manager_scored',
  'composite_computed',
  'finalized',
]);
export type AssessmentStatus = z.infer<typeof AssessmentStatusSchema>;

export const CycleStatusSchema = z.enum(['draft', 'open', 'locked', 'closed']);
export type CycleStatus = z.infer<typeof CycleStatusSchema>;

// ── Auth ───────────────────────────────────────────────────────
export const LoginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresInSec: z.number(),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const JwtClaimsSchema = z.object({
  sub: z.string().uuid(),           // user id
  orgId: z.string().uuid(),         // tenant id
  role: UserRoleSchema,
  email: z.string().email(),
  iat: z.number(),
  exp: z.number(),
});
export type JwtClaims = z.infer<typeof JwtClaimsSchema>;

// ── Assessment ─────────────────────────────────────────────────
export const ScoreSchema = z.number().min(0).max(5).multipleOf(0.01);

export const AssessmentResponseSchema = z.object({
  dimension: z.string().min(1).max(60),
  score: ScoreSchema,
  comment: z.string().max(2000).optional(),
});
export type AssessmentResponse = z.infer<typeof AssessmentResponseSchema>;

export const SaveSelfDraftDtoSchema = z.object({
  assessmentId: z.string().uuid(),
  responses: z.array(AssessmentResponseSchema).max(20),
});
export type SaveSelfDraftDto = z.infer<typeof SaveSelfDraftDtoSchema>;

export const SubmitSelfAssessmentDtoSchema = z.object({
  assessmentId: z.string().uuid(),
  responses: z.array(AssessmentResponseSchema).min(1).max(20),
});
export type SubmitSelfAssessmentDto = z.infer<typeof SubmitSelfAssessmentDtoSchema>;

export const AssessmentSubmissionJsonSchema = z.object({
  responses: z.array(AssessmentResponseSchema),
  savedAt: z.string().datetime(),
  submittedAt: z.string().datetime().optional(),
});
export type AssessmentSubmissionJson = z.infer<typeof AssessmentSubmissionJsonSchema>;

export const SubmitManagerAssessmentDtoSchema = z.object({
  assessmentId: z.string().uuid(),
  managerScore: ScoreSchema,
  rationale: z.string().min(1).max(5000),
  responses: z.array(
    z.object({
      dimension: z.string(),
      score: ScoreSchema,
      comment: z.string().optional(),
    }),
  ),
  overrodeAiSuggestion: z.boolean().default(false),
});
export type SubmitManagerAssessmentDto = z.infer<typeof SubmitManagerAssessmentDtoSchema>;

// ── Cycle ──────────────────────────────────────────────────────
export const CreateCycleDtoSchema = z.object({
  name: z.string().min(3).max(120),
  frameworkId: z.string().uuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});
export type CreateCycleDto = z.infer<typeof CreateCycleDtoSchema>;

// ── User management (Sprint 1) ─────────────────────────────────
export const InviteUserDtoSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  roleFamily: z.string().min(1).max(60),
  designation: z.string().min(1).max(120),
  role: UserRoleSchema.exclude(['super_admin']), // HR can't create super_admins
  managerId: z.string().uuid().nullable().optional(),
});
export type InviteUserDto = z.infer<typeof InviteUserDtoSchema>;

export const UpdateUserDtoSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  roleFamily: z.string().min(1).max(60).optional(),
  designation: z.string().min(1).max(120).optional(),
  role: UserRoleSchema.exclude(['super_admin']).optional(),
  managerId: z.string().uuid().nullable().optional(),
});
export type UpdateUserDto = z.infer<typeof UpdateUserDtoSchema>;

export const AcceptInviteDtoSchema = z.object({
  token: z.string().min(32),
  password: z
    .string()
    .min(10, 'at least 10 characters')
    .regex(/[A-Z]/, 'one uppercase letter')
    .regex(/[a-z]/, 'one lowercase letter')
    .regex(/\d/, 'one digit')
    .regex(/[^A-Za-z0-9]/, 'one symbol'),
});
export type AcceptInviteDto = z.infer<typeof AcceptInviteDtoSchema>;

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  roleFamily: z.string(),
  designation: z.string(),
  role: UserRoleSchema,
  managerId: z.string().uuid().nullable(),
  inviteAcceptedAt: z.string().datetime().nullable(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

// ── Competency framework (Sprint 1) ────────────────────────────
export const MaturityLevelSchema = z.object({
  level: z.number().int().min(1).max(10),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(500),
});
export type MaturityLevel = z.infer<typeof MaturityLevelSchema>;

export const CreateFrameworkDtoSchema = z.object({
  name: z.string().min(3).max(120),
  maturityLevels: z
    .array(MaturityLevelSchema)
    .min(2, 'at least two maturity levels')
    .max(10)
    .refine(
      (levels) => {
        const numbers = levels.map((l) => l.level).sort((a, b) => a - b);
        return numbers.every((n, i) => n === i + 1);
      },
      { message: 'maturity levels must be 1..N with no gaps' },
    ),
});
export type CreateFrameworkDto = z.infer<typeof CreateFrameworkDtoSchema>;

export const FrameworkStatusSchema = z.enum(['draft', 'active', 'archived']);
export type FrameworkStatus = z.infer<typeof FrameworkStatusSchema>;

export const UpsertRoleMappingDtoSchema = z.object({
  roleFamily: z.string().min(1).max(60),
  targetLevel: z.number().int().min(1).max(10),
  assessmentCriteria: z.object({
    rubric: z
      .array(
        z.object({
          dimension: z.string().min(1).max(60),
          weight: z.number().min(0).max(1),
        }),
      )
      .min(1),
  }),
});
export type UpsertRoleMappingDto = z.infer<typeof UpsertRoleMappingDtoSchema>;

// ── Organization settings (scoring weights, AI config) ─────────
export const AssessmentWeightsSchema = z
  .object({
    self: z.number().min(0).max(1),
    manager: z.number().min(0).max(1),
    peer: z.number().min(0).max(1),
    ai: z.number().min(0).max(1),
  })
  .refine(
    (w) => Math.abs(w.self + w.manager + w.peer + w.ai - 1) < 0.01,
    { message: 'weights must sum to 1.0 ± 0.01' },
  );
export type AssessmentWeights = z.infer<typeof AssessmentWeightsSchema>;

export const DEFAULT_ASSESSMENT_WEIGHTS: AssessmentWeights = {
  self: 0.15,
  manager: 0.5,
  peer: 0.2,
  ai: 0.15,
};

// ── Current user (Sprint 1) ────────────────────────────────────
export const MeResponseSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  orgName: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: UserRoleSchema,
  roleFamily: z.string(),
  designation: z.string(),
  managerId: z.string().uuid().nullable(),
  mfaEnabled: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ── Artifact ───────────────────────────────────────────────────
export const ArtifactTypeSchema = z.enum([
  'document',
  'code',
  'presentation',
  'prompt',
  'other',
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const RequestUploadUrlDtoSchema = z.object({
  assessmentId: z.string().uuid(),
  fileName: z.string(),
  fileSizeBytes: z.number().int().positive().max(25 * 1024 * 1024), // 25 MB
  mimeType: z.string(),
  artifactType: ArtifactTypeSchema,
});
export type RequestUploadUrlDto = z.infer<typeof RequestUploadUrlDtoSchema>;

// ── Notification preferences (Sprint 5) ────────────────────────
export const DigestFrequencySchema = z.enum(['daily', 'weekly', 'off']);
export type DigestFrequency = z.infer<typeof DigestFrequencySchema>;

export const NotificationPrefsSchema = z.object({
  reminders: z.object({
    enabled: z.boolean(),
    digestFrequency: DigestFrequencySchema,
  }),
  assignment: z.object({ enabled: z.boolean() }),
  managerReview: z.object({ enabled: z.boolean() }),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;

// Partial PATCH body — every field is optional, deep-merged server-side.
export const UpdateNotificationPrefsDtoSchema = NotificationPrefsSchema.deepPartial();
export type UpdateNotificationPrefsDto = z.infer<typeof UpdateNotificationPrefsDtoSchema>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  reminders: { enabled: true, digestFrequency: 'daily' },
  assignment: { enabled: true },
  managerReview: { enabled: true },
};
