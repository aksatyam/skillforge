/**
 * Mobile-responsive, email-safe HTML layout.
 *
 * Why table-based + inline CSS:
 *   - Gmail strips <style> and <link> in <head>; Outlook ignores modern CSS.
 *   - 600px max-width keeps desktop clients from over-stretching the layout.
 *   - System font stack avoids webfont blocking in Outlook/Apple Mail.
 *
 * All colors match SkillForge brand tokens (see CLAUDE.md + tailwind.config).
 */

export interface LayoutInput {
  title: string;
  preheader: string;
  bodyHtml: string;
  footerHtml?: string;
}

const BRAND_NAVY = '#1B3A5C';
const BRAND_DARK = '#2C3E50';
const BRAND_MEDIUM = '#7F8C8D';
const BG_LIGHT = '#F0F4F8';
const WHITE = '#FFFFFF';
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif";

/**
 * Simple HTML escape — keeps dynamic fields (names, cycle titles) from
 * breaking markup if they contain `<` or `&`. Templates pass user-controlled
 * strings through this before embedding in the HTML.
 */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderLayout(input: LayoutInput): string {
  const title = escapeHtml(input.title);
  const preheader = escapeHtml(input.preheader);
  const footer =
    input.footerHtml ??
    `You received this because you have a SkillForge account. Manage notification preferences in your SkillForge settings.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BG_LIGHT};font-family:${FONT_STACK};color:${BRAND_DARK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG_LIGHT};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${WHITE};border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:${BRAND_NAVY};padding:20px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${FONT_STACK};color:${WHITE};font-size:20px;font-weight:700;letter-spacing:-0.01em;">
                  SkillForge
                </td>
                <td align="right" style="font-family:${FONT_STACK};color:rgba(255,255,255,0.7);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">
                  Assessment Platform
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;font-family:${FONT_STACK};color:${BRAND_DARK};font-size:15px;line-height:1.55;">
            ${input.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 24px 28px;border-top:1px solid #E5E7EB;font-family:${FONT_STACK};color:${BRAND_MEDIUM};font-size:12px;line-height:1.5;">
            ${footer}
          </td>
        </tr>
      </table>
      <div style="max-width:600px;padding:12px;font-family:${FONT_STACK};color:${BRAND_MEDIUM};font-size:11px;">
        &copy; ${new Date().getUTCFullYear()} SkillForge AI
      </div>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Shared helper — formats a Date as "Friday, 31 May 2026" for email bodies.
 * Uses UTC to keep output deterministic across tz-shifted servers.
 */
export function formatEmailDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export const EMAIL_BRAND = {
  navy: BRAND_NAVY,
  dark: BRAND_DARK,
  medium: BRAND_MEDIUM,
  bgLight: BG_LIGHT,
  white: WHITE,
  fontStack: FONT_STACK,
} as const;
