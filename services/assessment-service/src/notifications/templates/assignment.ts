import { renderLayout, escapeHtml, formatEmailDate, EMAIL_BRAND } from './layout';
import type { RenderedEmail } from './reminder';

export interface AssignmentInput {
  employeeName: string;
  cycleName: string;
  cycleEndDate: Date;
  assessmentUrl: string;
}

export function renderAssignmentEmail(input: AssignmentInput): RenderedEmail {
  const { employeeName, cycleName, cycleEndDate, assessmentUrl } = input;
  const prettyDate = formatEmailDate(cycleEndDate);

  const subject = `You have a new assessment: ${cycleName}`;

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-family:${EMAIL_BRAND.fontStack};font-size:20px;font-weight:700;color:${EMAIL_BRAND.navy};">
      Hi ${escapeHtml(employeeName)},
    </h1>
    <p style="margin:0 0 16px 0;">
      You have been assigned a new self-assessment in the
      <strong>${escapeHtml(cycleName)}</strong> cycle.
    </p>
    <p style="margin:0 0 20px 0;">
      Please complete it before <strong>${escapeHtml(prettyDate)}</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;">
      <tr>
        <td style="background:${EMAIL_BRAND.navy};border-radius:6px;">
          <a href="${escapeHtml(assessmentUrl)}"
             style="display:inline-block;padding:12px 22px;font-family:${EMAIL_BRAND.fontStack};font-size:14px;font-weight:600;color:${EMAIL_BRAND.white};text-decoration:none;">
            Start my assessment
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
    preheader: `New assessment in ${cycleName} — due ${prettyDate}.`,
    bodyHtml,
  });

  const text =
    `Hi ${employeeName},\n\n` +
    `You have been assigned a new self-assessment in the "${cycleName}" cycle. ` +
    `Please complete it before ${prettyDate}.\n\n` +
    `Start here: ${assessmentUrl}\n\n` +
    `— SkillForge`;

  return { subject, html, text };
}
