/**
 * SkillForge AI — database seed for local development + CI.
 *
 * Creates:
 *   - 1 Organization (Qualtech)
 *   - 10 Users: 1 super_admin (Ashish), 1 hr_admin, 3 managers, 5 employees
 *   - 1 active CompetencyFramework with role mappings for common role families
 *   - 1 open AssessmentCycle (the "April-June 2026" cycle)
 *   - 5 Assessments (one per employee, all in not_started state)
 *
 * Idempotent: re-running returns the same IDs for deterministic Qualtech
 * org + users. Cycle ID is regenerated only on first run.
 *
 * Usage:
 *   pnpm db:seed
 */

import { PrismaClient, UserRole, FrameworkStatus, CycleStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Seed uses the admin connection string (BYPASSRLS role) so INSERTs
// aren't filtered by tenant policies. Falls back to DATABASE_URL.
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL! },
  },
});

// Dev-only seed password. Real Qualtech users will be invited and set their own.
const DEV_PASSWORD = 'Passw0rd!';
const passwordHash = bcrypt.hashSync(DEV_PASSWORD, 10);

// Deterministic UUIDs for stable seed across runs
const QUALTECH_ORG_ID = '00000000-0000-4000-8000-000000000001';
const ASHISH_USER_ID  = '00000000-0000-4000-8000-000000000010';
const HR_ADMIN_ID     = '00000000-0000-4000-8000-000000000011';

async function main() {
  console.log('🌱 Seeding SkillForge (Qualtech tenant)…');

  // 1. Organization
  const qualtech = await prisma.organization.upsert({
    where: { id: QUALTECH_ORG_ID },
    update: {},
    create: {
      id: QUALTECH_ORG_ID,
      name: 'Qualtech',
      domain: 'qualtech.com',
      subscriptionPlan: 'internal',
      settingsJson: {
        assessmentWeights: {
          self: 0.15,
          manager: 0.5,
          peer: 0.2,
          ai: 0.15,
        },
        ai: {
          employeeVisibility: 'after_submit', // ADR-008
          confidenceThresholds: { low: 60, high: 80 }, // ADR-006
        },
      },
    },
  });
  console.log(`  ✓ Organization: ${qualtech.name}`);

  // 2. Users — super_admin first (Ashish), then HR, managers, employees
  const ashish = await prisma.user.upsert({
    where: { orgId_email: { orgId: qualtech.id, email: 'ashish@qualtech.com' } },
    update: { passwordHash, inviteAcceptedAt: new Date() },
    create: {
      id: ASHISH_USER_ID,
      orgId: qualtech.id,
      email: 'ashish@qualtech.com',
      name: 'Ashish Kumar Satyam',
      roleFamily: 'Engineering',
      designation: 'Principal Engineer',
      role: UserRole.super_admin,
      mfaEnabled: true,
      passwordHash,
      inviteAcceptedAt: new Date(),
    },
  });

  const hrAdmin = await prisma.user.upsert({
    where: { orgId_email: { orgId: qualtech.id, email: 'hr@qualtech.com' } },
    update: { passwordHash, inviteAcceptedAt: new Date() },
    create: {
      id: HR_ADMIN_ID,
      orgId: qualtech.id,
      email: 'hr@qualtech.com',
      name: 'Priya Sharma',
      roleFamily: 'People',
      designation: 'HR Lead',
      role: UserRole.hr_admin,
      mfaEnabled: true,
      passwordHash,
      inviteAcceptedAt: new Date(),
    },
  });

  const managers = [];
  for (const m of [
    { email: 'eng.manager@qualtech.com', name: 'Rahul Verma', roleFamily: 'Engineering' },
    { email: 'prod.manager@qualtech.com', name: 'Ananya Iyer', roleFamily: 'Product' },
    { email: 'design.manager@qualtech.com', name: 'Arjun Menon', roleFamily: 'Design' },
  ]) {
    const mgr = await prisma.user.upsert({
      where: { orgId_email: { orgId: qualtech.id, email: m.email } },
      update: { passwordHash, inviteAcceptedAt: new Date() },
      create: {
        orgId: qualtech.id,
        email: m.email,
        name: m.name,
        roleFamily: m.roleFamily,
        designation: `${m.roleFamily} Manager`,
        role: UserRole.manager,
        managerId: hrAdmin.id,
        passwordHash,
        inviteAcceptedAt: new Date(),
      },
    });
    managers.push(mgr);
  }

  const employees = [];
  const empSeed = [
    { email: 'dev1@qualtech.com', name: 'Neha Kapoor', roleFamily: 'Engineering', mgr: managers[0] },
    { email: 'dev2@qualtech.com', name: 'Karthik Raj', roleFamily: 'Engineering', mgr: managers[0] },
    { email: 'pm1@qualtech.com', name: 'Sneha Das', roleFamily: 'Product', mgr: managers[1] },
    { email: 'designer1@qualtech.com', name: 'Ravi Nair', roleFamily: 'Design', mgr: managers[2] },
    { email: 'designer2@qualtech.com', name: 'Meera Pillai', roleFamily: 'Design', mgr: managers[2] },
  ];
  for (const e of empSeed) {
    const emp = await prisma.user.upsert({
      where: { orgId_email: { orgId: qualtech.id, email: e.email } },
      update: { passwordHash, inviteAcceptedAt: new Date() },
      create: {
        orgId: qualtech.id,
        email: e.email,
        name: e.name,
        roleFamily: e.roleFamily,
        designation: `${e.roleFamily} IC`,
        role: UserRole.employee,
        managerId: e.mgr.id,
        passwordHash,
        inviteAcceptedAt: new Date(),
      },
    });
    employees.push(emp);
  }
  console.log(`  ✓ Users: 1 super_admin + 1 hr_admin + ${managers.length} managers + ${employees.length} employees`);

  // 3. Competency Framework
  const framework = await prisma.competencyFramework.upsert({
    where: { id: '00000000-0000-4000-8000-000000000100' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000100',
      orgId: qualtech.id,
      name: 'Qualtech AI Capability Maturity Model',
      version: 1,
      status: FrameworkStatus.active,
      maturityLevelsJson: [
        { level: 1, name: 'Aware', description: 'Understands basic AI concepts; no hands-on usage' },
        { level: 2, name: 'Exploring', description: 'Tried AI tools on isolated tasks; inconsistent' },
        { level: 3, name: 'Practitioner', description: 'Regular, productive use of AI in daily work' },
        { level: 4, name: 'Advanced', description: 'Designs AI-integrated workflows for team' },
        { level: 5, name: 'Leader', description: 'Shapes AI strategy; mentors others; publishes patterns' },
      ],
      createdById: ashish.id,
    },
  });

  for (const rm of [
    { roleFamily: 'Engineering', targetLevel: 3 },
    { roleFamily: 'Product', targetLevel: 3 },
    { roleFamily: 'Design', targetLevel: 2 },
    { roleFamily: 'People', targetLevel: 2 },
  ]) {
    await prisma.roleMapping.upsert({
      where: { frameworkId_roleFamily: { frameworkId: framework.id, roleFamily: rm.roleFamily } },
      update: { targetLevel: rm.targetLevel },
      create: {
        frameworkId: framework.id,
        roleFamily: rm.roleFamily,
        targetLevel: rm.targetLevel,
        assessmentCriteriaJson: {
          rubric: [
            { dimension: 'Tool Usage', weight: 0.3 },
            { dimension: 'Output Quality', weight: 0.4 },
            { dimension: 'Sophistication', weight: 0.2 },
            { dimension: 'Knowledge Sharing', weight: 0.1 },
          ],
        },
      },
    });
  }
  console.log(`  ✓ Framework: ${framework.name}`);

  // 4. Assessment Cycle
  const cycle = await prisma.assessmentCycle.upsert({
    where: { id: '00000000-0000-4000-8000-000000000200' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000200',
      orgId: qualtech.id,
      frameworkId: framework.id,
      name: 'Qualtech AI Capability — April–June 2026',
      startDate: new Date('2026-04-15'),
      endDate: new Date('2026-05-31'),
      status: CycleStatus.open,
      createdById: hrAdmin.id,
    },
  });
  console.log(`  ✓ Assessment cycle: ${cycle.name}`);

  // 5. Assessments for all employees (not_started)
  for (const emp of employees) {
    await prisma.assessment.upsert({
      where: { cycleId_userId: { cycleId: cycle.id, userId: emp.id } },
      update: {},
      create: {
        cycleId: cycle.id,
        userId: emp.id,
      },
    });
  }
  console.log(`  ✓ Assessments: ${employees.length}`);

  console.log('\n🎉 Seed complete. Test login (password: Passw0rd!):');
  console.log('   super_admin:  ashish@qualtech.com');
  console.log('   hr_admin:     hr@qualtech.com');
  console.log('   manager:      eng.manager@qualtech.com');
  console.log('   employee:     dev1@qualtech.com');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
