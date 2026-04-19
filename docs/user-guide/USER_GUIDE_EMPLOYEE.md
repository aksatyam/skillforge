# SkillForge AI — Employee Quick Guide

> **For**: Employees · **Read time**: ~8 minutes · **Version**: 1.0 · **Last updated**: 2026-04-19
> **Full guide**: [`../USER_GUIDE.md`](../USER_GUIDE.md) · **Support**: `skillforge-support@qualtech.ai`

If your role pill (bottom-left of the sidebar) says `EMPLOYEE`, this one-pager has everything you need. For deeper topics, jump to the full guide.

---

## What you'll do on SkillForge

1. **Self-assess** against your role's AI-capability framework for each review cycle.
2. **Attach evidence** (artifacts) that support your scores.
3. **Track your progress** over time on your scorecard.
4. **Tune your notifications** so you only get the emails that matter.

---

## First-time setup (one minute)

1. **Open the invite email** from `no-reply@skillforge.qualtech.ai`.
2. **Click the link** — opens `/invite/<token>`.
3. **Set your password** — 8+ characters, a letter and a number. Passphrases are best.
4. **You're in.** The link is single-use and expires in 7 days.

> _Screenshot placeholder: `screenshots/employee-01-invite-accept.png` — the invite-accept page with pre-filled name/email and set-password form._

### Signing in afterwards
- URL: `https://skillforge.qualtech.ai/login`
- SSO button if your tenant is wired to your IdP — click it, login with your corporate credentials, done.
- If you get rate-limited (10 failed attempts/minute), wait a minute and try again.

---

## Flow 1 — Submit your self-assessment

### Step 1: Open the cycle

From the sidebar → **My Assessments** (`/assessments`).

You'll see one card per cycle. Look for the cycle with **“Start assessment”** or **“Resume draft”** button.

> _Screenshot placeholder: `screenshots/employee-02-assessments-list.png` — the assessments grid with open/in-progress/completed cards._

### Step 2: Score each dimension

Click the card → opens the self-assessment form at `/assessments/[id]`.

**Per dimension you'll:**
- Read the **dimension description** (what "Prompting" means here).
- Read the **5 maturity-level rubrics** (Aware → Exploring → Applying → Leading → Transformative).
- Pick a **score** between 0.00 and 5.00 (you can go fractional — e.g. 3.5).
- Add a **comment** (optional, up to 2000 chars) that backs up your score.
- Attach **artifacts** (optional, see Flow 2).

> _Screenshot placeholder: `screenshots/employee-03-self-assessment-form.png` — the scoring form with dimension nav on the left and the rubric+score+comment card on the right._

### Step 3: Save or submit

- **Save draft** (blue) — parks your work. Drafts also auto-save every 30 seconds.
- **Submit** (navy) — final. You cannot edit after this.

> **Rule**: you must score every dimension before Submit is enabled. A red dot in the left nav marks anything you've missed.

### Step 4: Wait

After you submit, your manager gets an email. You'll see the status move from `self_submitted` → `manager_in_progress` → `manager_scored` → (eventually) `finalized` on your `/assessments` card.

---

## Flow 2 — Attach artifacts as evidence

Every dimension card has a drag-drop **Artifact Uploader**.

**What works:**
- PDF, PNG, JPG, MP4, DOCX, XLSX, TXT
- Up to 25 MB per file
- Up to 5 files per dimension

**How it works behind the scenes (useful to know when things fail):**
1. Your browser asks SkillForge for a signed **upload URL**.
2. The URL has a 15-minute expiry and carries your org-id as a signed claim.
3. Your browser PUTs the file directly to S3 — it never touches our app servers.
4. We record the artifact metadata and attach it to your assessment.

**If upload fails**, just re-drop the file. A fresh URL is issued. The old one is single-use anyway.

> _Screenshot placeholder: `screenshots/employee-04-artifact-upload.png` — the drag-drop uploader mid-upload with progress bar._

---

## Flow 3 — Review your scorecard

Sidebar → **My scorecard** (`/scorecard`).

**What you'll see:**
- **Radar chart** — one polygon per cycle, overlaid, so you can see dimension-by-dimension growth.
- **Histogram** — score distribution across your dimensions in the latest finalized cycle.
- **Cycle-by-cycle table** — self avg, manager avg, composite, delta vs. previous.
- **Trajectory line** — composite over time.

You can filter by framework if you've been assessed under multiple (e.g. role-change mid-year).

> _Screenshot placeholder: `screenshots/employee-05-scorecard.png` — the scorecard with radar + histogram + cycle table._

---

## Flow 4 — Tune your notifications

Sidebar → **Notification settings** (`/settings/notifications`).

**Notifications you'll get by default:**

| Notification | When |
|---|---|
| Cycle opened | Right when HR opens it |
| Self-assessment deadline | 48h before, 24h before, at deadline |
| Assessment finalized | When HR closes the cycle |
| Weekly digest | Mondays 9am (opt-in, off by default) |

**You can turn off** anything except:
- Password changes + MFA enrolment + new-device sign-in (security-critical).
- Account deactivation (you need to know when your account is disabled).

---

## Cheat sheet

| I want to… | Go to… |
|---|---|
| See all my cycles | `/assessments` |
| Fill in a self-assessment | Click an open cycle card |
| Resume a draft | Same — look for **Resume draft** button |
| See my growth over time | `/scorecard` |
| Change my password | Profile menu (bottom-left) → Security |
| Set up MFA | Profile menu → Security → Enable MFA |
| Stop certain emails | `/settings/notifications` |
| Sign out everywhere | Profile menu → Security → Sign out everywhere |

## Common gotchas

- **"Submit is greyed out"** → a dimension is still unscored. Red dot in the left nav shows which one.
- **"My draft didn't save"** → check the footer timestamp. If it says *“Saving failed — will retry,”* your network is flaky. Don't close the tab.
- **"I changed my mind after submitting"** → you can't edit. Ask your manager to capture the correction in their rationale, or ask HR to reopen if the cycle is still `open`.
- **"The invite link says 'already used'"** → it's single-use. Ask HR to re-invite.
- **"My scores show up wrong after a role change"** → your new role may have different target maturities. That's expected; the scorecard filter lets you see per-framework.

## What about Phase 2?

Phase 2 (starts June 2026) adds:
- **AI-suggested scores** for managers — they'll still override, so your manager's number still wins.
- **Peer feedback** — 3–5 peers each cycle, anonymous aggregation.
- **Mobile app** — view scorecards and approve simple actions on iOS / Android.
- **PDF scorecard export** — download your `/scorecard` for performance reviews.

---

## Need help?

| What's wrong | Who to ping |
|---|---|
| Can't sign in | `skillforge-support@qualtech.ai` |
| Lost MFA device | Super Admin (your HR Admin can escalate) |
| Suspected security issue | `skillforge-security@qualtech.ai` |
| Feature request / feedback | `#skillforge-support` Slack channel |

**Include the request-ID** from the error toast or browser network tab — it's the fastest way for support to trace your exact call.
