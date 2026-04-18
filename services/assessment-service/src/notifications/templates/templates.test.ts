import { describe, it, expect } from 'vitest';
import { renderReminderEmail } from './reminder';
import { renderAssignmentEmail } from './assignment';
import { renderManagerReviewEmail } from './manager-review';

const ASSESSMENT_URL = 'https://app.skillforge.local/assessments';

describe('renderReminderEmail', () => {
  const base = {
    employeeName: 'Alice Zhang',
    cycleName: 'Q2 2026',
    daysLeft: 3,
    cycleEndDate: new Date('2026-05-31T00:00:00Z'),
    assessmentUrl: ASSESSMENT_URL,
  };

  it('subject starts with "Reminder:"', () => {
    const { subject } = renderReminderEmail(base);
    expect(subject.startsWith('Reminder:')).toBe(true);
  });

  it('includes employee name, cycle name, days-left and link in both html and text', () => {
    const { html, text } = renderReminderEmail(base);
    for (const out of [html, text]) {
      expect(out).toContain('Alice Zhang');
      expect(out).toContain('Q2 2026');
      expect(out).toContain('3');
      expect(out).toContain(ASSESSMENT_URL);
    }
  });

  it('singular "day" when daysLeft === 1', () => {
    const { subject, text } = renderReminderEmail({ ...base, daysLeft: 1 });
    expect(subject).toContain('1 day');
    expect(subject).not.toContain('1 days');
    expect(text).toContain('1 day');
  });

  it('html passes basic email-safety sanity checks', () => {
    const { html } = renderReminderEmail(base);
    // Required top-level tags
    expect(html).toContain('<html');
    expect(html).toContain('<body');
    // No <link> or <style> in head — Gmail strips both.
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<style\b/i);
    // Inline styles present (table-based layout + inline style attrs)
    expect(html).toMatch(/style="[^"]+"/);
  });

  it('plaintext output has no HTML tags at all', () => {
    const { text } = renderReminderEmail(base);
    expect(text).not.toMatch(/<[a-z][^>]*>/i);
    expect(text).not.toMatch(/<\/[a-z]+>/i);
  });

  it('escapes unsafe characters in user-supplied fields', () => {
    const { html } = renderReminderEmail({
      ...base,
      employeeName: 'Bobby <script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderAssignmentEmail', () => {
  it('subject starts with "You have a new assessment"', () => {
    const { subject } = renderAssignmentEmail({
      employeeName: 'Alice',
      cycleName: 'Q2 2026',
      cycleEndDate: new Date('2026-05-31T00:00:00Z'),
      assessmentUrl: ASSESSMENT_URL,
    });
    expect(subject.startsWith('You have a new assessment')).toBe(true);
  });

  it('html/text both contain the link and cycle name', () => {
    const { html, text } = renderAssignmentEmail({
      employeeName: 'Alice',
      cycleName: 'Q2 2026',
      cycleEndDate: new Date('2026-05-31T00:00:00Z'),
      assessmentUrl: ASSESSMENT_URL,
    });
    for (const out of [html, text]) {
      expect(out).toContain('Q2 2026');
      expect(out).toContain(ASSESSMENT_URL);
    }
  });
});

describe('renderManagerReviewEmail', () => {
  it('subject starts with "Review pending"', () => {
    const { subject } = renderManagerReviewEmail({
      managerName: 'Maya',
      employeeName: 'Alice',
      assessmentUrl: ASSESSMENT_URL,
    });
    expect(subject.startsWith('Review pending')).toBe(true);
  });

  it('includes both names plus link in both outputs', () => {
    const { html, text } = renderManagerReviewEmail({
      managerName: 'Maya',
      employeeName: 'Alice',
      assessmentUrl: ASSESSMENT_URL,
    });
    for (const out of [html, text]) {
      expect(out).toContain('Maya');
      expect(out).toContain('Alice');
      expect(out).toContain(ASSESSMENT_URL);
    }
  });

  it('plaintext has no HTML tags', () => {
    const { text } = renderManagerReviewEmail({
      managerName: 'Maya',
      employeeName: 'Alice',
      assessmentUrl: ASSESSMENT_URL,
    });
    expect(text).not.toMatch(/<[a-z][^>]*>/i);
  });
});
