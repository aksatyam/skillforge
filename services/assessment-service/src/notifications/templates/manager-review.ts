import { renderLayout, escapeHtml, EMAIL_BRAND } from './layout';
import type { RenderedEmail } from './reminder';

export interface ManagerReviewInput {
  managerName: string;
  employeeName: string;
  assessmentUrl: string;
}

export function renderManagerReviewEmail(input: ManagerReviewInput): RenderedEmail {
  const { managerName, employeeName, assessmentUrl } = input;

  const subject = `Review pending: ${employeeName}'s self-assessment`;

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-family:${EMAIL_BRAND.fontStack};font-size:20px;font-weight:700;color:${EMAIL_BRAND.navy};">
      Hi ${escapeHtml(managerName)},
    </h1>
    <p style="margin:0 0 16px 0;">
      <strong>${escapeHtml(employeeName)}</strong> has submitted their self-assessment and it is
      now waiting for your review and scoring.
    </p>
    <p style="margin:0 0 20px 0;">
      Reviews are most useful when completed while the employee's context is fresh.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;">
      <tr>
        <td style="background:${EMAIL_BRAND.navy};border-radius:6px;">
          <a href="${escapeHtml(assessmentUrl)}"
             style="display:inline-block;padding:12px 22px;font-family:${EMAIL_BRAND.fontStack};font-size:14px;font-weight:600;color:${EMAIL_BRAND.white};text-decoration:none;">
            Open the review
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 4px 0;font-size:13px;color:${EMAIL_BRAND.medium};">
      Link: <a href="${escapeHtml(assessmentUrl)}" style="color:${EMAIL_BRAND.navy};">${escapeHtml(assessmentUrl)}</a>
    </p>
  `;

  const html = renderLayout({
    title: subject,
    preheader: `${employeeName}'s self-assessment is ready for your review.`,
    bodyHtml,
  });

  const text =
    `Hi ${managerName},\n\n` +
    `${employeeName} has submitted their self-assessment and it is now waiting for your ` +
    `review and scoring.\n\n` +
    `Open the review: ${assessmentUrl}\n\n` +
    `— SkillForge`;

  return { subject, html, text };
}
