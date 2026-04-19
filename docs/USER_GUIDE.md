# SkillForge AI — Application User Guide

> **Version 1.0** · Phase 1 (Hyper-MVP) · Through Sprint 6
> **Audience**: All platform users — Employees, Managers, HR Admins, AI Champions, Leadership, Super Admins
> **Classification**: Internal / Confidential
> **Owner**: Qualtech · **Prepared by**: Ashish Kumar Satyam · for Qualtech
> **Last updated**: 2026-04-19

---

## How to read this guide

The guide is organized **by role**. Find your role in the table of contents, read that chapter end-to-end, and you'll have everything you need. Workflows that cross roles (for example: Employee submits → Manager scores → HR finalizes) live in **Chapter 10 — End-to-End Journey**.

- **“You see this”** = in-product behavior, exactly what the UI shows.
- **“Why”** = the rule or invariant behind the behavior, so you can predict it in edge cases.
- **“Heads up”** = gotcha, permission boundary, or Phase-2 preview.

If a menu item referenced here isn't visible to you, either your role doesn't have access (see §2.3 Role matrix) or the feature ships in Phase 2 (see §12).

---

## Table of contents

1. [Welcome to SkillForge AI](#1-welcome-to-skillforge-ai)
2. [Getting started](#2-getting-started)
    2.1 [Accepting your invite](#21-accepting-your-invite)
    2.2 [Signing in](#22-signing-in)
    2.3 [Roles at a glance](#23-roles-at-a-glance)
    2.4 [Navigating the app shell](#24-navigating-the-app-shell)
    2.5 [Your profile and preferences](#25-your-profile-and-preferences)
3. [For Employees](#3-for-employees)
4. [For Managers](#4-for-managers)
5. [For HR Admins](#5-for-hr-admins)
6. [For AI Champions](#6-for-ai-champions)
7. [For Leadership](#7-for-leadership)
8. [For Super Admins](#8-for-super-admins)
9. [Notifications](#9-notifications)
10. [End-to-End Journey](#10-end-to-end-journey)
11. [Security, Privacy, and Your Data](#11-security-privacy-and-your-data)
12. [What's coming in Phase 2](#12-whats-coming-in-phase-2)
13. [Troubleshooting](#13-troubleshooting)
14. [FAQ](#14-faq)
15. [Glossary](#15-glossary)
16. [Support and contact](#16-support-and-contact)

---

## 1. Welcome to SkillForge AI

**SkillForge AI** is Qualtech's internal platform for capturing, scoring, and analyzing employee AI-capability across a structured competency framework. It replaces scattered spreadsheets and one-off review forms with a single, auditable workflow that feeds appraisals, training plans, and organizational capability reports.

### 1.1 What SkillForge gives you

| If you are a… | You use SkillForge to… |
|---|---|
| **Employee** | Self-assess against your role's competency framework, upload supporting artifacts, view your scorecard, track progress across cycles. |
| **Manager** | Review your direct reports' self-assessments, score each dimension with rationale, override (where required) AI-suggested scores. |
| **HR Admin** | Publish competency frameworks, open / lock / finalize / close review cycles, invite users, pull reports and CSV exports for the appraisal system. |
| **AI Champion** | Curate frameworks, monitor score distributions, own the dimension-level rubrics. |
| **Leadership** | Read dashboards and org-wide capability reports without changing underlying data. |
| **Super Admin** | Operate the tenant — everything above, plus role changes, SSO config, and break-glass access. |

### 1.2 The five promises SkillForge keeps

1. **One source of truth.** Every score — self, manager, AI-suggested (Phase 2), composite — is stored once, timestamped, and audited.
2. **Manager decisions rule.** AI scores are **advisory only**. When they exist (Phase 2), a manager must confirm or override with a written rationale before the score is final.
3. **Your data stays in your tenant.** Qualtech's data never mixes with any other organization on the platform. Queries filter by organization at the database level.
4. **Audit-first.** Who scored what, when, and what they overrode — all captured, all retainable for seven years.
5. **Secure by default.** OWASP ASVS L2, SOC 2 Type II alignment, DPDP Act 2023 compliance. PII is stripped before any AI call.

---

## 2. Getting started

### 2.1 Accepting your invite

Your HR Admin creates your account and emails you a one-time invite link. The link looks like:

```
https://skillforge.qualtech.ai/invite/<long-random-token>
```

When you click the link you land on the invite-accept page.

**You see this:**
1. Your name and email are pre-filled (you cannot change them here — raise a ticket if they're wrong).
2. A **Set password** form with two fields: *New password* and *Confirm*.
3. Password rules: minimum 8 characters; must contain a letter and a number. Use a passphrase — length beats complexity.
4. Clicking **Activate account** signs you in immediately and takes you to your dashboard.

**Why this flow is atomic:** the server treats “consume invite token → set password → issue your first session” as one transaction. Either all three succeed or none do. You'll never end up with a half-activated account.

**Heads up:**
- Invite links expire 7 days after issue. Expired? Ask HR to re-invite — the old token is burned.
- The link is single-use. If you open it twice, the second visit will say *“This invite has already been used.”*
- If your organization uses SSO (see §2.2.2), you may not need to set a password at all — HR Admin will tell you.

### 2.2 Signing in

SkillForge supports two sign-in modes, depending on how your tenant is configured.

#### 2.2.1 Email + password

1. Open `https://skillforge.qualtech.ai/login`.
2. Enter the email you were invited on and your password.
3. Click **Sign in**.

On success you land on `/dashboard`. Your session cookies are HTTP-only and `SameSite=Lax` — this means you stay signed in across tabs, but a malicious site cannot silently borrow your session.

**If sign-in fails:**
- Bad email/password: the screen shows *“Invalid credentials.”* No hint about which field is wrong (this is by design).
- Rate-limited: after 10 failed attempts in 60 seconds from the same IP, you're asked to wait. The counter resets.

#### 2.2.2 Single Sign-On (SSO)

If your tenant is wired to your corporate identity provider (IdP), the login screen shows a **“Sign in with SSO”** button alongside the email/password form.

1. Click **Sign in with SSO**.
2. You're redirected to your IdP (Keycloak, Azure AD, Okta — depends on your tenant).
3. Complete your usual corporate login (including MFA if your IdP enforces it).
4. You're bounced back to SkillForge, already signed in.

**Why this is safer:** SkillForge never sees your corporate password. We only receive a signed assertion from your IdP that confirms your identity and which audience (our app) the assertion was minted for.

#### 2.2.3 Multi-Factor Authentication (MFA)

MFA is **mandatory for admin roles** (HR Admin, AI Champion, Super Admin). It's enforced at the IdP when SSO is used, or via TOTP authenticator app for password accounts. Employees and Managers may opt in.

To set up TOTP:
1. **Profile menu** (bottom-left, your avatar) → **Security** → **Enable MFA**.
2. Scan the QR code with Google Authenticator / Authy / 1Password.
3. Enter the 6-digit code to confirm.
4. Save the recovery codes somewhere safe — you'll need one if you lose your phone.

### 2.3 Roles at a glance

SkillForge has six roles. Your role is assigned by an HR Admin at invite time and printed in the bottom-left of the sidebar under your name (in a small rounded pill).

| Role | Primary use | Can create / edit… | Read-only access to… |
|---|---|---|---|
| `employee` | Self-assessments, view own scorecard, upload artifacts | Own assessments (until submitted) | Own history |
| `manager` | Score direct reports | Manager scoring form for own team | Own team's roster + history |
| `hr_admin` | Run cycles + frameworks + users | Frameworks, cycles, users, export templates | Whole tenant (org-wide) |
| `ai_champion` | Curate frameworks, monitor rubric quality | Frameworks (same as HR Admin) | Whole tenant |
| `leadership` | Read dashboards | Nothing | Whole tenant — read-only |
| `super_admin` | Tenant ops, break-glass | Everything | Everything |

**Role matrix — who sees which nav item:**

| Nav item | employee | manager | hr_admin | ai_champion | leadership | super_admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| My Assessments | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| My scorecard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Team overview | — | ✓ | ✓ | — | — | ✓ |
| Team roster | — | ✓ | ✓ | — | — | ✓ |
| Frameworks | — | — | ✓ | — | — | ✓ |
| Users | — | — | ✓ | — | — | ✓ |
| Cycles | — | — | ✓ | — | — | ✓ |
| Reports | — | — | ✓ | — | — | ✓ |
| Export templates | — | — | ✓ | — | — | ✓ |
| HR Dashboard | — | — | ✓ | — | — | ✓ |
| Notification settings | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

> **Why `super_admin` sees everything:** the app-shell's nav filter short-circuits for super-admins so the role doesn't require any new nav entries. Super-admins are expected to self-restrict — see §8.

### 2.4 Navigating the app shell

Every page has the same layout once you're signed in:

```
┌──────────────────────────────────────────────────────────────┐
│ [Sidebar]                          [Main content area]       │
│  SkillForge AI                                               │
│  Qualtech                                                    │
│                                                              │
│  ▸ Dashboard                                                 │
│  ▸ My Assessments                    <Current page goes     │
│  ▸ My scorecard                       here — forms, tables,  │
│  ▸ Team overview     (role-gated)     dashboards, etc.>      │
│  ▸ Team roster       (role-gated)                            │
│  …                                                           │
│                                                              │
│  ─────────────────────                                       │
│  Your Name                                                   │
│  your.email@…                                                │
│  [EMPLOYEE]                                                  │
│  ⏻  Sign out                                                 │
└──────────────────────────────────────────────────────────────┘
```

- The **active nav item** is highlighted in navy. If you navigate to a sub-page (e.g. `/team/[userId]/assessment/[id]`), the closest parent nav item lights up.
- The **organization name** at the top of the sidebar confirms which tenant you're signed into.
- The **role pill** at the bottom is your source of truth for what you can and can't do.
- The **Sign out** button revokes your refresh token server-side, clears cookies, and bounces you to `/login`. It does NOT just hide the UI.

### 2.5 Your profile and preferences

From the bottom-left **your name / email** block you can reach:

- **Security** — MFA enrolment, session list, “sign out everywhere” (revokes all refresh tokens for your account).
- **Notification settings** (`/settings/notifications`) — see §9.
- **Password** — change your password. Requires current password. If you're on SSO, this link is hidden.

---

## 3. For Employees

> **You are an employee if** your role pill says `EMPLOYEE`. You own your self-assessments, you can view your scorecard, and you can upload artifacts that support your scores.

### 3.1 Your dashboard (`/dashboard`)

The dashboard is your landing page. For employees it shows:

1. **Open cycles** — a card per cycle that's accepting self-assessments from you. Each card has a **“Start assessment”** (or **“Resume draft”**) button.
2. **Upcoming deadline** — the soonest `selfAssessmentDeadline` across your open cycles.
3. **Quick stats strip** — completion %, last submitted date, average self-score across the last finalized cycle.

### 3.2 My Assessments (`/assessments`)

Grid of your assessments, one card per cycle.

**Each card shows:**
- Cycle name (e.g. *“H1 2026 — AI Capability Review”*).
- Current status badge (see status grid below).
- Framework + target maturity level for your role.
- A status-aware CTA: *Start*, *Resume draft*, *View submission*, *View final score*.

**Status grid you'll see:**

| Status | What it means | What you can do |
|---|---|---|
| `not_started` | Cycle opened, you haven't started yet | Click **Start assessment** |
| `self_submitted` | You submitted; waiting on manager | View (read-only) |
| `manager_in_progress` | Manager is actively scoring | View (read-only) |
| `ai_analyzed` *(Phase 2)* | AI has suggested scores | View (read-only) |
| `manager_scored` | Manager finalized their scores | View both self + manager |
| `composite_computed` | System computed weighted composite | View composite |
| `finalized` | HR closed the cycle | Read-only history |

### 3.3 Filling out a self-assessment (`/assessments/[id]`)

The self-assessment form is the heart of the platform for an employee.

**Layout:**
- **Left column** — the dimension list (e.g. *Prompting*, *Evaluation*, *Responsible-AI awareness*, …). Clicking a dimension scrolls to that section.
- **Right column (main)** — one card per dimension:
  - **Dimension name + description** (what “Prompting” means in this framework).
  - **Maturity-level rubric** — 5 levels from *Aware* (1) to *Transformative* (5). You pick the level that best matches you, plus optional fractional confidence (e.g. 3.5 if you're halfway between *Applying* and *Leading*).
  - **Supporting comment** (optional, 2000 chars) — *“I used ReAct-style agents to automate three SLA escalations last quarter.”*
  - **Artifact uploader** (optional) — drag-drop files to attach screenshots, write-ups, code samples. See §3.5.
- **Footer bar** — **Save draft** (blue) and **Submit** (navy). Auto-save runs every 30 seconds regardless.

**Rules:**
- Score range: `0.00` to `5.00`, in steps of `0.01` (the form rounds for you; nothing more precise than two decimals is accepted).
- You must fill **every dimension** before you can click **Submit**. Drafts can be partial; submissions cannot.
- Once you submit, the form is locked. You can still view it but not edit.
- You get up to 20 dimensions per assessment (platform cap).

**Auto-save contract:**
- After 30 seconds of no edits OR immediately when you click **Save draft**, the form POSTs a `SaveSelfDraftDto` to the server.
- A tiny status text in the footer flashes *“Saved at 10:23 AM”* on each successful save.
- If your network drops, the status shows *“Saving failed — will retry.”* Your unsaved edits live in the browser until a save succeeds. Don't close the tab; you'll lose them.

**Heads up:**
- You cannot edit a submitted assessment. If you realize you were wrong, contact your manager — they can capture the correction in their scoring rationale.
- Uploading 20 large artifacts slows submission. Keep files under 10 MB where possible.

### 3.4 My scorecard (`/scorecard`)

Your scorecard is the longitudinal view — how you've scored across all your cycles.

**You see:**
- **Score radar chart** — one polygon per cycle, overlaid, so you can see how you've grown dimension-by-dimension.
- **Score histogram** — distribution of your dimensions-as-scored in the latest finalized cycle.
- **Cycle-by-cycle table** — cycle name, self-score avg, manager-score avg, composite score, delta vs. previous cycle.
- **Trajectory line** — composite score over time.

You can filter by framework if you've been assessed across multiple (e.g. you switched from an Engineering framework to a Product framework mid-year).

### 3.5 Uploading artifacts

Every dimension card has an artifact slot. Artifacts are *evidence* — a manager or reviewer can open them to verify your self-score.

**What you can upload:**
- PDF, PNG, JPG, MP4, DOCX, XLSX, TXT.
- Max file size: **25 MB per file**.
- Max files per dimension: 5.

**How upload works (technical but worth knowing):**
1. You drop a file in the upload area.
2. The browser asks SkillForge for a signed **upload URL**. This URL embeds a short-lived (15-minute) token that carries your organization id and the target artifact id.
3. The browser PUTs the file directly to S3 using the signed URL. It never touches our application servers.
4. The browser tells SkillForge *“upload finished, here's the file reference.”*
5. SkillForge verifies the token (same orgId? right scope? not expired?), records the artifact, and makes it available on the assessment.

**Why this matters to you:** if an upload fails mid-way, you can retry by re-dropping the file. The old signed URL is single-use and will reject a second attempt, so a re-drop gets a fresh URL.

**Downloads work the same way** — clicking an artifact link generates a 5-minute signed URL scoped to your organization. Sharing that URL with a colleague outside your organization will not work: their tenant id won't match.

### 3.6 Your notifications

See §9 for the full notification settings page. In short: you get emails when a cycle opens for you, when a deadline is 48 hours away, and when your assessment is finalized.

---

## 4. For Managers

> **You are a manager if** your role pill says `MANAGER`. You score your direct reports. You can also do everything an employee does (you have your own assessments too).

### 4.1 Your dashboard (`/dashboard`)

In addition to the employee cards, managers see:

1. **Team pending count** — how many of your reports have submitted but not yet been scored by you.
2. **Team completion donut** — % of your team who've submitted self-assessments for the current open cycle.
3. **Deadline strip** — your own `managerScoringDeadline` for the current cycle.

### 4.2 Team roster (`/team`)

The roster lists your direct reports with their current-cycle assessment status.

**You see:**
- Name, email, role, target maturity level.
- Current assessment status (see §3.2 status grid).
- Quick-filter: **Pending** (default) or **All**. *Pending* shows anyone who's submitted their self-assessment and is waiting on you — this is usually what you want.
- Click a row → lands you on the manager scoring form for that person.

### 4.3 Team overview (`/team/overview`)

A chart-first view of your team's aggregate capability:

- **Team radar** — the average self-score and (once scored) average manager-score across dimensions. Dual-overlay lets you spot systematic bias (team over-rating themselves on *Prompting*? Under-rating themselves on *Responsible-AI*?).
- **Per-person mini-cards** — each direct report as a mini radar tile. Click for their full scorecard.
- **Completion donut** — same as the dashboard version, but filterable by cycle.

### 4.4 Scoring a report (`/team/[userId]/assessment/[assessmentId]`)

This is the manager-scoring form — the single most important screen you interact with.

**Layout:**
- **Header** — employee name, role, cycle, status, deadline countdown.
- **Left column** — dimension list (same nav style as the employee form).
- **Right column (main)** — one card per dimension. For each dimension you see:
  - **Employee's self-score** (read-only, rendered in muted grey).
  - **Employee's comment + artifacts** — read the comment, click any artifact to preview/download.
  - **AI suggested score** *(Phase 2)* — shown as an `AiSuggestionBadge`. A confidence band (e.g. *85% confident, ±0.3*) accompanies the number. Today this is a placeholder; until Phase 2 lands, the badge says *“AI analysis not yet available for this cycle.”*
  - **Manager score input** — you set the definitive number. Range `0.00`–`5.00`.
  - **Rationale textarea** — mandatory. Minimum 20 characters. If you override an AI-suggested score, the rationale is **required** and flagged in the audit log.
- **Composite preview** (sticky right sidebar) — as you score, the composite recalculates live using the framework's dimension weights. You see what the final number will look like before you submit.
- **Footer bar** — **Save draft**, **Submit scores**.

**Rules and why they exist:**

- **AI scores are advisory only.** Your number wins. Every time. This is a platform invariant and cannot be configured away.
- **Overriding AI requires written rationale.** If your manager-score differs from the AI suggestion by more than 0.5 points, the rationale is required and saved to the audit log alongside the score, the old value, and the new value.
- **Every dimension must be scored** before you can click **Submit scores** — partials are saved as drafts.
- **You cannot score your own team member twice.** Once you submit, the assessment transitions to `manager_scored`. HR Admin or Super Admin can reopen it on request, but that event is logged.

**Heads up:**
- If the report submitted their self-assessment after you started scoring, the form shows a *“Updated 3 min ago — refresh to see changes”* banner. Refreshing is cheap and non-destructive; your in-progress draft is preserved.
- Cross-team scoring: you cannot score someone who isn't your direct report, even if you have their assessment ID. The server checks ownership on every read.

### 4.5 Common manager tasks

**“I submitted the wrong score — can I fix it?”**
Yes, but only while the cycle status is `open`. Ask HR Admin to reopen your scoring for that report — they can do it with one click from `/hr/cycles/[id]`. The reopening creates an audit entry with *your* name as the requester.

**“I want to write long comments for everyone at once.”**
Use draft mode — fill in rationale for all reports across multiple sittings. Drafts auto-save every 30 seconds just like the employee form.

**“I'm leaving the org; how do I hand off my team?”**
HR Admin re-parents your reports under the new manager via `/users`. Your scoring drafts for them travel with the assessment record, not with you — the new manager inherits them.

---

## 5. For HR Admins

> **You are an HR Admin if** your role pill says `HR_ADMIN`. You own the cycle. You also have organization-wide read access and can invite new users. In most orgs you'll also own the competency frameworks, though that responsibility may be shared with an AI Champion.

### 5.1 HR Dashboard (`/hr`)

Your landing page. Optimized for *“what needs my attention today?”*.

**You see:**
- **KPI strip** — total open cycles, total users, completion % across open cycles, average manager-scoring turnaround.
- **Live cycle cards** — every cycle whose status is `draft` / `open` / `locked`, each with:
  - Completion donut (employees submitted vs. total).
  - Manager-scoring donut (reports scored vs. submitted).
  - Quick actions: **Open**, **Lock**, **Bulk finalize**, **Close**.
- **Recently closed cycles** (last 6) for quick history access.
- **Outlier badges** — cycles where nothing has moved in 48+ hours get a yellow `● At Risk` pill.

### 5.2 Managing cycles (`/cycles` and `/hr/cycles/[id]`)

A cycle is the top-level container for a review round. Every assessment belongs to exactly one cycle.

**Cycle statuses:**

| Status | What's allowed | Transition to |
|---|---|---|
| `draft` | Add / remove participants. No assessments issued yet. | `open` |
| `open` | Employees can self-assess; managers can score; drafts are editable. | `locked` or `closed` |
| `locked` | No new edits. HR can bulk-finalize composites. Audit window. | `closed` |
| `closed` | Fully immutable. Read-only forever. | (terminal) |

**To create a cycle:**
1. `/cycles` → **New cycle**.
2. Fill in: name, framework, participant roster (select from users), target maturity per role, `selfAssessmentDeadline`, `managerScoringDeadline`.
3. Save as draft. Review the participant list — **this is where you correct mistakes before they propagate**.
4. Click **Open**. All participants get an email; employees see the cycle on their dashboards.

**To lock a cycle:**
- `/hr/cycles/[id]` → **Lock cycle**. A confirmation modal warns: *“Locking blocks all further edits. Manager scoring drafts will be frozen. Continue?”*
- You can unlock back to `open` if no finalize has run. After finalize, locking is one-way.

**To bulk-finalize:**
- *“Bulk finalize”* kicks a background job that computes every composite score in the cycle using the framework weights.
- The screen shows live progress. Typical time: ~2 seconds per 100 assessments.
- If any assessment is still in `self_submitted` (manager never scored), the job flags it and asks: *“Skip unscored?”* — Y/N per row or all-at-once.

**To close a cycle:**
- Closing a cycle is the final commit. It's audited as `cycle.closed` with the closing admin's user id.
- After closing, the cycle appears in the **Recently closed** section but cannot be modified.

### 5.3 Managing users (`/users`)

The user list shows every active user in your organization with: name, email, role, target maturity level, created date, last sign-in, status.

**You can:**
- **Invite a new user** — email + role + manager + target maturity. The system generates a one-time invite token and emails the link. Invite valid for 7 days.
- **Edit a user** — name, role (cannot demote yourself), manager, target level. Email is immutable (people leave, addresses stay).
- **Deactivate a user** — soft-delete. Their historical assessments stay on-record; they just can't sign in or receive new assessments.
- **Resend invite** — rotates the token. Old link becomes invalid.
- **Reassign manager** — moves all assessments for this person under a new manager. Previous manager retains read-only access to their historical scorings.

**Heads up:**
- You cannot change your own role. Ask a Super Admin.
- Email changes are not supported. Deactivate + re-invite with the new address if a user's email truly changes.

### 5.4 Managing frameworks (`/frameworks`)

A competency framework is the definition of *what to measure*. It contains:
- **Dimensions** (up to 20): e.g. *Prompting*, *Evaluation*, *Responsible-AI*, *Workflow automation*.
- **Dimension weights** that sum to 1.0 (used for composite calculation).
- **Maturity levels** per dimension: 5 named tiers with descriptor text (Aware → Exploring → Applying → Leading → Transformative).
- **Role mappings**: which roles are expected at which maturity level per dimension (e.g. a *Senior Engineer* should be at level 4 on *Evaluation*).

**Framework lifecycle:**
- **Draft** — editable, not assignable to cycles.
- **Published** — immutable, can be attached to cycles. Each cycle snapshots the framework definition at the moment of creation, so later edits to a new framework version don't retroactively change old scores.
- **Archived** — hidden from new-cycle selection, but old cycles still reference their snapshot.

**To create a framework:**
1. `/frameworks/new`.
2. Name, description, dimensions + weights. The form validates that weights sum to 1.00 before you can save.
3. Per dimension, write the 5 maturity-level descriptors. These become the rubric text employees see while self-scoring.
4. Map roles to expected levels per dimension.
5. Save as draft. Review with your AI Champion / Leadership.
6. **Publish** when ready. Publishing is one-way — you must create a new framework (or clone this one) to change anything post-publish.

### 5.5 Reports (`/hr/reports`)

Organization-wide reports for leadership review and appraisal input.

**Reports available:**
- **Capability heat-map** — dimension × role heat-map. Cells colored by average composite score. Use to spot gaps (e.g. *“Product Managers are at 2.1 on Evaluation — we need training”*).
- **Cycle-over-cycle delta** — per-dimension delta between the last two finalized cycles. Positive green, negative red.
- **Role-target gap** — percentage of employees at or below target maturity per dimension. Appears as a sortable table.
- **Outlier list** — employees whose composite is >2σ below their role's peer-group average. Intended as a conversation-starter, not a verdict.

Every report supports CSV export (see §5.6) and PDF export (Phase 2).

### 5.6 CSV export for appraisal

From `/hr/cycles/[id]` → **Export to CSV** or `/hr/reports` → **Export**.

**The CSV format:**
- **RFC 4180** compliant. UTF-8 with BOM (so Excel renders non-Latin characters correctly out of the box).
- Fixed column order — your appraisal system's import template is pinned to this order.
- One row per (employee, dimension) pair plus a composite row per employee.
- Text fields are double-quoted; embedded quotes are doubled.

**Security note:** exports are generated from an allowlist of fields (see §11 and ADR-012). You cannot export PII that isn't on the allowlist. If an appraisal system needs a new column, file a request — it requires a schema update, not a config toggle.

### 5.7 Export templates (`/hr/templates`)

If your organization's appraisal system takes a slightly different column set or order, you can define an **export template**: a named subset of allowed fields in a custom order.

**Templates come in two flavors:**
- **Built-in** — shipped with the platform, cannot be edited or deleted. Used for the default export.
- **Tenant custom** — created by your HR Admin team. Editable and deletable. The platform enforces that any `builtin: true` flag on a tenant-custom template is silently rewritten to `false` — you can't forge a built-in template.

**To create a template:**
1. `/hr/templates` → **New template**.
2. Pick a name (e.g. *“HRIS integration — Workday Q2 2026”*).
3. Pick columns from the allowlist (e.g. `user.name`, `user.email`, `dimension.name`, `score.composite`). Disallowed fields (e.g. `user.password`, `orgId`, `responsesJson`) do not appear in the picker at all.
4. Order them.
5. Save.

Templates surface as a dropdown on the CSV export screen.

### 5.8 Common HR tasks

**“I need to re-open scoring for one person.”**
`/hr/cycles/[id]` → find the assessment row → **Reopen manager scoring**. The action is audit-logged with your user id.

**“An employee left mid-cycle.”**
`/users` → deactivate. Their assessment is excluded from the cycle's completion count. Their partial data stays in the cycle for historical completeness.

**“I need to fix a framework after publishing.”**
You cannot edit a published framework. Clone it, edit the clone, publish the new version with an incremented name. New cycles use the new version. Old cycles keep their snapshot.

---

## 6. For AI Champions

> **You are an AI Champion if** your role pill says `AI_CHAMPION`. You share framework-ownership with HR Admin and are the organizational steward of rubric quality and AI-score calibration.

### 6.1 What you do today (Phase 1)

Until Phase 2 lands, AI Champion shares the framework interface with HR Admin. You have access to:

- **Frameworks** (`/frameworks`) — create, edit-while-draft, publish, archive. Same UI as §5.4.
- **Reports** (`/hr/reports`) — all tenant-wide reports, for calibration analysis.
- **Users** (`/users`) — read-only in Phase 1. You can see role-target assignments but not change them.

You do NOT have access to cycle management or user invites in Phase 1 — those stay with HR Admin until we split the screens in Phase 2.

### 6.2 Your responsibilities

1. **Rubric quality.** Read every new framework's dimension descriptors before publish. Do the five maturity tiers sound distinct? Could an employee land between two levels and not know which to pick?
2. **Score-distribution audit.** After each cycle finalizes, pull the capability heat-map and look for suspect patterns — e.g. *every* manager in a business unit scores *every* dimension at level 3 (statistical flatness is usually a sign of low engagement, not low variance).
3. **Training-need feed.** Flag dimensions where ≥40% of employees are below target. These feed the L&D pipeline.

### 6.3 What's coming in Phase 2 for you

- **AI suggestion calibration dashboard** — compare AI-suggested scores to manager-finalized scores. Heat-map of dimensions where AI systematically over- or under-scores.
- **Bias detection panel** — spotlight pairs (role × rater-manager) where the manager-AI delta is consistently skewed.
- **Prompt monitoring** — anonymized samples of Claude input/output, to verify PII stripping is working and the suggestions are grounded in evidence.
- **Rubric A/B tester** — try two alternative descriptors on a dimension, measure which one reduces inter-rater variance.

---

## 7. For Leadership

> **You are in the Leadership group if** your role pill says `LEADERSHIP`. You read, you don't write. SkillForge is your organizational capability telescope.

### 7.1 What you see

- **Dashboard** — your own tile, plus a read-only org-wide KPI strip (total users, total cycles, average composite across last finalized cycle).
- **My scorecard** — your own history, like any employee.
- **Team overview + roster** — if you have direct reports, you see them (you inherit manager-style views for your own team).

### 7.2 What you do NOT have

- Cycle management, user invites, framework editing — these are HR / AI Champion.
- You cannot override a manager score.
- You cannot export CSVs — ask HR to run the export for you. This is intentional: data export is an audited event with a specific actor.

### 7.3 Read-only reports (roadmap)

Phase 2 adds a dedicated **Leadership dashboard** at `/leadership` with:
- Org-wide capability heat-map over time.
- Role-group capability scorecards.
- Training ROI tracker (composite delta vs. training cost).

---

## 8. For Super Admins

> **You are a Super Admin if** your role pill says `SUPER_ADMIN`. You have all permissions, across all roles. Use them sparingly.

### 8.1 What Super Admin adds on top

- **Role changes for anyone, including yourself.** Change an employee to manager, an HR admin to super admin, etc.
- **Tenant configuration** — SSO endpoint URLs, Keycloak realm, IdP audience, bridge secret length enforcement (these live in environment + config and cannot be hot-swapped in the UI; changes require a deploy).
- **Break-glass read access** — you can open any assessment, any cycle, any user's history. Every break-glass read is logged with your user id, a timestamp, and (in Phase 2) a required *“reason”* field.
- **Cycle force-unlock** — if a cycle is `locked` but needs one more score, you can force it back to `open`. Audit trail captures this.
- **Audit log access** — full append-only log of every write in the tenant.

### 8.2 The self-restraint rules

Super Admin is a **break-glass role**, not an every-day role. The expectation:

1. **Do your day job in your real role.** If you're functionally an HR Admin, use an HR Admin account for daily work and only switch to Super Admin for privileged operations.
2. **Leave a trail.** Every Super Admin action that changes or reads data is audited. SOC 2 expects the audit log to be reviewed monthly.
3. **Do not share the account.** Super Admin login is MFA-required and tied to one human. Team handoffs happen via deactivate + create new super-admin, not by sharing credentials.

### 8.3 Super Admin operations you should know

- **Rotate JWT_SECRET.** In the event of a suspected token leak, rotating `JWT_SECRET` (a server-side env variable, not a UI toggle) invalidates *all* outstanding tokens — including any malicious ones in flight. Coordinate with infra; this is a 5-minute service restart.
- **Rotate SSO_BRIDGE_SECRET.** Same pattern, for the SSO bridge. Production requires ≥32 chars.
- **Cycle emergency close.** If data quality problems surface mid-cycle, closing early is one click. The audit entry records your reason (Phase 2 makes reason mandatory).

---

## 9. Notifications

Every role can customize what emails they get. Go to **Notification settings** (bottom of sidebar or `/settings/notifications`).

### 9.1 Notification types

| Notification | Who gets it | When |
|---|---|---|
| **Cycle opened** | Employees in the cycle | When HR Admin clicks *Open* |
| **Self-assessment deadline** | Employee | 48h before deadline, again 24h before, then at deadline |
| **Self-assessment submitted** | The employee's manager | Immediately after submission |
| **Manager scoring deadline** | Manager | 48h / 24h / at-deadline reminders |
| **Assessment finalized** | Employee | When HR closes or bulk-finalizes the cycle |
| **Weekly digest** | Opt-in for all roles | Monday 9am tenant-local time |
| **System alerts** | Admins only (HR, AI Champion, Super) | On cycle failures, export failures, quota breaches |

### 9.2 Settings you control

- **Per-type toggle** — turn any notification off.
- **Delivery channel** — email (default). In-app will arrive in Phase 2. Slack / Teams in Phase 3.
- **Digest cadence** — daily, weekly, off.
- **Quiet hours** — outside these hours, non-critical notifications queue until quiet-hours end.

### 9.3 What you cannot turn off

- **Security-critical emails** — password changes, MFA enrolment, new-device sign-in, your account being deactivated. These are required by security standards.
- **Audit notifications for break-glass access** — Super Admin will always be notified when their account is used outside business hours.

---

## 10. End-to-End Journey

How a single review cycle flows end-to-end across all roles. Use this as the canonical reference when onboarding a new admin or explaining the platform to a stakeholder.

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  1. HR Admin creates cycle (draft)                                   │
│     └─> picks framework, roster, deadlines                           │
│                                                                      │
│  2. HR Admin opens cycle                                             │
│     └─> employees get email + see cycle on dashboard                 │
│                                                                      │
│  3. Employee fills self-assessment                                   │
│     ├─> auto-saves every 30s                                         │
│     ├─> uploads artifacts (optional)                                 │
│     └─> submits → status: self_submitted                             │
│                                                                      │
│  4. Manager gets email that report submitted                         │
│     ├─> opens /team → filters Pending                                │
│     ├─> opens scoring form                                           │
│     ├─> reads self-score + comment + artifacts                       │
│     ├─> (Phase 2) sees AI-suggested score                            │
│     ├─> sets manager score + rationale                               │
│     └─> submits → status: manager_scored                             │
│                                                                      │
│  5. HR Admin monitors /hr dashboard                                  │
│     └─> sees completion donuts, identifies stragglers                │
│                                                                      │
│  6. HR Admin locks cycle after manager deadline                      │
│     └─> no new edits allowed                                         │
│                                                                      │
│  7. HR Admin clicks Bulk Finalize                                    │
│     ├─> system computes composite scores using framework weights     │
│     ├─> status: composite_computed (per assessment)                  │
│     └─> employees get "your assessment is finalized" email           │
│                                                                      │
│  8. HR Admin exports CSV for appraisal system                        │
│     └─> RFC 4180, allowlist-filtered, audited                        │
│                                                                      │
│  9. HR Admin closes cycle                                            │
│     └─> status: closed → read-only forever                           │
│                                                                      │
│  10. Employee sees finalized scores on /scorecard                    │
│      └─> trend line updates; radar gets a new polygon                │
│                                                                      │
│  11. AI Champion reviews score distributions via /hr/reports         │
│      └─> feeds training plan for next quarter                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Typical cycle durations at Qualtech:**

| Phase | Typical duration |
|---|---|
| Draft (HR setup) | 2–3 business days |
| Open for self-assessment | 2 weeks |
| Open for manager scoring | 1 week |
| Locked + finalize | 1 day |
| Appraisal integration + closed | 1 day |
| **Total per cycle** | **~4 weeks** |

---

## 11. Security, Privacy, and Your Data

### 11.1 Authentication

- Passwords are stored as **bcrypt** hashes with per-password salts. We cannot recover your password — resets are always rotation, never retrieval.
- Access tokens are JWTs with a 15-minute expiry. Your browser silently refreshes them using a rotating refresh token. You rarely notice.
- All tokens are **HTTP-only cookies** — JavaScript running in the browser (including any stray analytics script) cannot read them.
- SSO tokens are verified against your tenant-configured issuer AND audience — a token minted for a different app in the same Keycloak realm will not be accepted here.

### 11.2 Multi-tenancy

- Every database row is tagged with `org_id`. Every query the platform runs filters by `org_id`. This is enforced at two layers:
  1. **Application guards** — every request carries your `orgId` (from your JWT), and the platform wraps all DB access in a tenant-scope context.
  2. **Database row-level security (RLS)** — Postgres enforces the filter at the engine level. Even if an application bug forgot to filter, the database would refuse to return another tenant's rows.
- Cross-tenant lookups by ID are rejected with `404 Not Found`, not `403 Forbidden` — telling an attacker that a resource exists but they can't see it is itself a leak.

### 11.3 Data encryption

- **In transit**: TLS 1.3 on every public endpoint. HSTS header pins it.
- **At rest**: RDS + S3 encrypted with AWS KMS-managed keys.
- **Field-level**: email and phone columns use `pgcrypto` for an extra layer in addition to disk encryption. Useful if a DB backup is exfiltrated.
- **Secrets**: stored in AWS Secrets Manager, never in `.env` files in production container images.

### 11.4 Audit log

- Every write on assessments, cycles, users, frameworks, and artifacts creates an audit entry with actor, timestamp, old value, new value, and request ID.
- The audit log is **append-only** — the service role has no UPDATE or DELETE grants on it. Only a Super Admin operating at the database level could tamper, and that tampering itself leaves traces.
- Retention: **7 years**, per SOC 2.

### 11.5 AI and PII

- Your name, email, and any directly-identifying free-text are **stripped before any Claude API call**. The AI sees pseudonymous `employee_7f3a9c…` identifiers and your scores + evidence, not your identity.
- AI outputs are validated against a schema before they're written to the database. A malformed AI response is rejected, not stored.
- Anthropic does not store your data for training — we use the zero-data-retention API agreement.

### 11.6 Rate limits and CSRF defense

- Every authentication endpoint (login, refresh, accept-invite, SSO exchange) is rate-limited. After ~10 requests per minute per IP, you get a cooldown.
- Every state-changing API call from your browser is origin-checked. An attacker's website cannot POST to SkillForge on your behalf, even if you're signed in.

### 11.7 Your rights under DPDP Act 2023

- **Right to access**: request your data via HR.
- **Right to correction**: name typos, role errors — HR can fix.
- **Right to erasure**: request deletion via HR. The platform supports cascading soft-delete + PII scrub within 30 days. Anonymized aggregate data (cycle averages, framework heat-maps) is retained for legitimate interest.
- **Consent records**: your invite-accept is logged with timestamp + the privacy-notice version you saw.

---

## 12. What's coming in Phase 2

Phase 2 is AI Intelligence — starting 2026-06-08 after the May-2026 appraisal cycle. Things to expect:

| Feature | Who benefits | Replaces / Adds |
|---|---|---|
| Claude-powered artifact analysis | Managers | *“AI has read the 5 artifacts this employee uploaded and highlighted these three”* — cuts review time |
| AI-suggested scores with confidence bands | Managers | Fills the Phase-1 `AiSuggestionBadge` placeholder on the scoring form |
| Peer feedback | Employees | 3–5 peers per cycle; anonymous aggregation |
| HRMS integration | HR Admin | Bi-directional sync with your HRIS — no more CSV copy-paste |
| Mobile app (React Native Expo) | All roles | View scorecards and approve simple actions on iOS / Android |
| Bias detection | AI Champion | Manager-AI delta analysis, role-group bias surfacing |
| Leadership dashboard | Leadership | Read-only, org-wide capability telescope |
| In-app notifications | All | Complements email; no more inbox noise |

---

## 13. Troubleshooting

### 13.1 I can't sign in

1. **Did you get the invite email?** Check spam. Invites come from `no-reply@skillforge.qualtech.ai`.
2. **Did the invite expire?** Ask HR to re-invite. Old links stay dead; new links work.
3. **SSO loop (redirected back to login with no error)?** Usually an audience-mismatch on your IdP side. Screenshot the URL (not the tokens) and send to support.
4. **Password reset stuck?** Reset links expire in 1 hour. Request again.
5. **MFA lost?** Use a recovery code. If you don't have one, Super Admin can reset your MFA after an identity check.

### 13.2 My self-assessment won't submit

1. **All dimensions filled?** The Submit button is disabled until every dimension has a score. A red dot next to the left-column nav marks any dimension that's missing.
2. **Network offline?** Auto-save shows *“Saving failed — will retry.”* Check connectivity; don't close the tab.
3. **Session expired?** After 15 minutes idle, your token may have expired and the silent refresh can't recover. Re-login in another tab, come back, **Save draft**. Your unsaved input will be saved via the refreshed session.

### 13.3 I can't see someone I think I manage

- Check that `/users` shows them with you as their manager (HR Admin can check).
- Check that the cycle they're in has them on the roster.
- If both look right, raise a ticket — this may be a data issue.

### 13.4 The CSV doesn't import into our appraisal system

- Make sure you're using the correct **export template** (`/hr/templates`).
- Validate the CSV is UTF-8 with BOM — our default is BOM-on because Excel needs it; some older tools choke on BOM. If your system wants no BOM, we need a config change.
- Confirm column names match your import spec exactly. Case-sensitive.

### 13.5 Artifact upload fails

- **File too big?** 25 MB per file is the hard limit.
- **Wrong file type?** PDF / PNG / JPG / MP4 / DOCX / XLSX / TXT are supported.
- **“Upload URL expired”?** The token is valid for 15 minutes. If you waited longer than that after clicking upload, re-drop the file — a new token is issued.

### 13.6 “Something went wrong” generic error

Every API response carries a **request-ID** header. When you file a ticket, paste that ID — it's the fastest way for support to find your exact call in the audit log.

---

## 14. FAQ

**Q: Can I see how my manager scored me before it's finalized?**
A: No. While the status is `manager_in_progress`, the manager's scores are hidden from you. Once the cycle is `composite_computed` or `finalized`, you see them on `/scorecard`.

**Q: Can I re-submit my self-assessment if I change my mind?**
A: Not after submission. Ask your manager to reflect the update in their rationale, or ask HR to reopen your assessment if the cycle is still `open`.

**Q: Does SkillForge look at my Slack / email / calendar?**
A: No. SkillForge only sees what you type into it and the artifacts you upload. Phase 2 may add optional integrations; they'll be opt-in.

**Q: Who can see my free-text comments?**
A: Your manager, HR Admin, AI Champion, and Super Admin. Leadership cannot. Peers cannot. Other employees cannot.

**Q: Can Claude see my name?**
A: No. Names and emails are stripped before any AI call. Claude sees pseudonymous IDs, scores, and evidence — never identifiers.

**Q: What happens if the platform goes down mid-assessment?**
A: Your last auto-save is safe. You'll see an error toast; refresh once the platform is back and the **Resume draft** CTA will pick up where you left off.

**Q: Can I export my personal scorecard?**
A: Phase 2 adds a PDF download on `/scorecard`. Today, ask HR for an export.

**Q: Can a manager delete my submission?**
A: No. Managers cannot delete employee data. HR Admin or Super Admin can *reopen* an assessment for correction, but the reopen itself is audited. Nothing is ever truly deleted — we soft-delete with a scrub-after-retention policy.

**Q: I'm a manager and also an employee. How does that work?**
A: Cleanly. You do your own self-assessment (in `/assessments`) and score your reports (in `/team`). Your manager scores yours in their own `/team`. The platform treats you as both, simultaneously.

**Q: What browsers are supported?**
A: The latest two versions of Chrome, Edge, Firefox, and Safari. Mobile browsers work but the responsive polish ships with the Phase-2 mobile app.

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **Assessment** | A single (cycle × employee) record holding self-score, manager-score, AI-suggested-score, composite, and artifacts. |
| **Artifact** | A file attached to an assessment dimension as evidence. |
| **Audit log** | Append-only record of every data-changing action in the tenant. |
| **BFF** | Backend-For-Frontend. The Next.js route handlers that mediate between your browser and the API service. |
| **Break-glass** | Elevated access used only in emergencies. Always audited. |
| **Competency framework** | The definition of what dimensions to measure and how. |
| **Composite score** | The single number per assessment, computed as a dimension-weight-weighted average of manager scores. |
| **CSRF** | Cross-Site Request Forgery. SkillForge defends against it with Origin-header checks. |
| **Cycle** | A named review round — e.g. *“H1 2026 AI Capability Review”*. |
| **Dimension** | A unit of measurement inside a framework — e.g. *Prompting*, *Evaluation*. |
| **HRIS** | Human Resources Information System — your org's master HR database (e.g. Workday, SAP SuccessFactors). |
| **JWT** | JSON Web Token — the signed token that proves who you are on each request. |
| **Manager override** | A manager choosing a different score than the AI suggestion. Rationale is required. |
| **Maturity level** | A rubric tier, 1–5, per dimension. |
| **MFA** | Multi-Factor Authentication. |
| **OIDC** | OpenID Connect. The SSO protocol SkillForge uses. |
| **PII** | Personally Identifiable Information. Stripped before AI calls. |
| **Refresh token** | Long-lived token that quietly replaces expired access tokens. Rotated on each use. |
| **RLS** | Row-Level Security. Postgres feature that enforces tenant isolation at the engine level. |
| **Scope claim** | A claim inside a signed short-lived URL that pins it to one action (upload / download / invite). |
| **SSO** | Single Sign-On. |
| **Target maturity** | The level a role is expected to reach per dimension. |
| **Tenant** | One customer organization's isolated slice of the platform. Qualtech is one tenant; resale customers are separate tenants. |

---

## 16. Support and contact

| Channel | Use for |
|---|---|
| Email: `skillforge-support@qualtech.ai` | General questions, feature requests |
| Email: `skillforge-security@qualtech.ai` | Suspected security incidents, lost-MFA, break-glass |
| Slack: `#skillforge-support` (Qualtech internal) | Quick questions, peer help |
| Status page: `https://status.skillforge.qualtech.ai` | Known incidents, planned maintenance |
| Docs: `https://skillforge.qualtech.ai/docs` | This guide, admin runbooks, API reference |

**Response targets:**

| Priority | First response | Resolution target |
|---|---|---|
| P0 — Can't sign in / data loss | 1 business hour | 4 business hours |
| P1 — Cycle operations blocked | 4 business hours | 1 business day |
| P2 — UI bug, feature question | 1 business day | 5 business days |
| P3 — Feature request | 5 business days | Assessed in next sprint planning |

---

*End of User Guide v1.0. This document is version-controlled in the SkillForge repository at `docs/USER_GUIDE.md`. Corrections and additions welcome via pull request to `main`.*
