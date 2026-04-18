import { renderLayout, escapeHtml, formatEmailDate, EMAIL_BRAND } from './layout';

export interface ReminderInput {
  employeeName: string;
  cycleName: string;
  daysLeft: number;
  cycleEndDate: Date;
  assessmentUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderReminderEmail(input: ReminderInput): RenderedEmail {
  const { employeeName, cycleName, daysLeft, cycleEndDate, assessmentUrl } = input;
  const dayLabel = daysLeft === 1 ? 'day' : 'days';
  const prettyDate = formatEmailDate(cycleEndDate);

  const subject = `Reminder: your self-assessment for ${cycleName} is due in ${daysLeft} ${dayLabel}`;

  const bodyHtml = `
    <h1 style="margin:0 0 12px 0;font-family:${EMAIL_BRAND.fontStack};font-size:20px;font-weight:700;color:${EMAIL_BRAND.navy};">
      Hi ${escapeHtml(employeeName)},
    </h1>
    <p style="margin:0 0 16px 0;">
      Your self-assessment for the <strong>${escapeHtml(cycleName)}</strong> cycle is still not started.
    </p>
    <p style="margin:0 0 20px 0;">
      The cycle closes on <strong>${escapeHtml(prettyDate)}</strong>
      &mdash; <strong>${daysLeft} ${dayLabel}</strong> from today.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;">
      <tr>
        <td style="background:${EMAIL_BRAND.navy};border-radius:6px;">
          <a href="${escapeHtml(assessmentUrl)}"
             style="display:inline-block;padding:12px 22px;font-family:${EMAIL_BRAND.fontStack};font-size:14px;font-weight:600;color:${EMAIL_BRAND.white};text-decoration:none;">
            Complete your self-assessment
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 4px 0;font-size:13px;color:${EMAIL_BRAND.medium};">
      Or copy this link: <a href="${escapeHtml(assessmentUrl)}" style="color:${EMAIL_BRAND.navy};">${escapeHtml(assessmentUrl)}</a>
    </p>
  `;

  const html = renderLayout({
    title: subject,
    preheader: `Your ${cycleName} self-assessment is due in ${daysLeft} ${dayLabel}.`,
    bodyHtml,
  });

  const text =
    `Hi ${employeeName},\n\n` +
    `Your self-assessment for the "${cycleName}" cycle is still not started. ` +
    `The cycle closes on ${prettyDate} (${daysLeft} ${dayLabel} away).\n\n` +
    `Complete it here: ${assessmentUrl}\n\n` +
    `— SkillForge`;

  return { subject, html, text };
}
