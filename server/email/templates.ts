import type { Appointment, Circle, Dose } from '../../shared/types';
import type { DoseStage } from '../../shared/escalation';
import type { Email } from '../ports/services';

/**
 * Reminder emails: large type, one clear action, and only the minimum detail
 * (medication name, dose and time). Every value is HTML-escaped.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

const COLORS = { ink: '#1f1a3d', muted: '#5b5675', amber: '#b45309', cream: '#fff8ec', indigo: '#2e2a6b' };

function layout(title: string, body: string, footer: string): string {
  return `<!doctype html><html lang="en"><body style="margin:0;background:${COLORS.cream};font-family:Arial,Helvetica,sans-serif;color:${COLORS.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td style="font-size:14px;letter-spacing:2px;color:${COLORS.amber};font-weight:bold">SAANJH</td></tr>
<tr><td><h1 style="font-size:26px;line-height:1.3;margin:12px 0 8px">${escapeHtml(title)}</h1></td></tr>
<tr><td style="font-size:19px;line-height:1.5">${body}</td></tr>
<tr><td style="font-size:14px;color:${COLORS.muted};padding-top:24px">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

function button(label: string, href: string, primary: boolean): string {
  const style = primary
    ? `background:${COLORS.indigo};color:#ffffff`
    : `background:#ffffff;color:${COLORS.indigo};border:2px solid ${COLORS.indigo}`;
  return `<a href="${escapeHtml(href)}" style="${style};display:inline-block;padding:16px 28px;border-radius:12px;font-size:20px;font-weight:bold;text-decoration:none;margin:8px 8px 0 0">${escapeHtml(label)}</a>`;
}

const doseLine = (dose: Dose): string =>
  `<strong>${escapeHtml(dose.medName)}</strong>${dose.medDose ? ` · ${escapeHtml(dose.medDose)}` : ''} at <strong>${escapeHtml(dose.localTime)}</strong>${dose.withFood ? ' · with food' : ''}`;

const settingsFooter = (appUrl: string): string =>
  `You receive this because you are in a Saanjh care circle. <a href="${escapeHtml(appUrl)}/circle">Change email settings</a>.`;

export interface DoseLinks {
  take: string;
  skip: string;
}

/** Reminder to the elder (or caretaker) before or just after a dose is due. */
export function doseReminderEmail(
  to: string,
  stage: Exclude<DoseStage, 'missed'>,
  dose: Dose,
  links: DoseLinks,
  appUrl: string,
): Email {
  const title = stage === 'upcoming' ? `Time for ${dose.medName}` : `Did you take ${dose.medName}?`;
  const intro =
    stage === 'upcoming' ? 'Your next medicine is due:' : 'This medicine has not been marked yet:';
  const body = `<p>${intro}</p><p>${doseLine(dose)}</p><p>${button('I took it', links.take, true)}${button('Skip this dose', links.skip, false)}</p>`;
  const text = `${title}\n\n${intro} ${dose.medName} ${dose.medDose} at ${dose.localTime}.\n\nI took it: ${links.take}\nSkip: ${links.skip}`;
  return { to, subject: title, html: layout(title, body, settingsFooter(appUrl)), text };
}

/** Escalation to family and caretakers when a dose stays unconfirmed. */
export function missedDoseEmail(to: string, circle: Circle, dose: Dose, appUrl: string): Email {
  const title = `${circle.elderName} has not confirmed ${dose.medName}`;
  const body = `<p>${doseLine(dose)} has not been marked as taken.</p><p>A gentle call may help. If it was taken, it can be marked in Saanjh.</p><p>${button('Open Saanjh', `${appUrl}/today`, true)}</p>`;
  const text = `${title}\n\n${dose.medName} ${dose.medDose} at ${dose.localTime} has not been marked as taken.\n\nOpen Saanjh: ${appUrl}/today`;
  return { to, subject: title, html: layout(title, body, settingsFooter(appUrl)), text };
}

/** Appointment reminder 24 hours and 2 hours ahead. */
export function appointmentEmail(
  to: string,
  circle: Circle,
  appt: Appointment,
  whenText: string,
  hoursAhead: number,
  appUrl: string,
): Email {
  const title = `${hoursAhead === 2 ? 'In 2 hours' : 'Tomorrow'}: ${appt.doctor}`;
  const place = appt.place ? `<p>Place: ${escapeHtml(appt.place)}</p>` : '';
  const body = `<p>${escapeHtml(circle.elderName)} has an appointment with <strong>${escapeHtml(appt.doctor)}</strong>${appt.speciality ? ` (${escapeHtml(appt.speciality)})` : ''}.</p><p>When: <strong>${escapeHtml(whenText)}</strong></p>${place}<p>${button('See visit brief', `${appUrl}/appointments`, true)}</p>`;
  const text = `${title}\n\n${circle.elderName} has an appointment with ${appt.doctor} at ${whenText}. ${appt.place}`;
  return { to, subject: title, html: layout(title, body, settingsFooter(appUrl)), text };
}

/** Low-stock notice. */
export function lowStockEmail(
  to: string,
  circle: Circle,
  medName: string,
  daysLeft: number,
  appUrl: string,
): Email {
  const title = `Time to refill ${medName}`;
  const body = `<p>${escapeHtml(circle.elderName)} has about <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> of ${escapeHtml(medName)} left.</p><p>${button('Open Saanjh', `${appUrl}/medicines`, true)}</p>`;
  const text = `${title}\n\nAbout ${daysLeft} days of ${medName} left.`;
  return { to, subject: title, html: layout(title, body, settingsFooter(appUrl)), text };
}

/** Weekly plain-language summary. */
export function digestEmail(
  to: string,
  circle: Circle,
  digest: { headline: string; summary: string; encouragement: string },
  appUrl: string,
): Email {
  const title = `This week with ${circle.elderName}`;
  const body = `<p><strong>${escapeHtml(digest.headline)}</strong></p><p>${escapeHtml(digest.summary)}</p><p>${escapeHtml(digest.encouragement)}</p><p>${button('See details', `${appUrl}/insights`, true)}</p>`;
  const text = `${title}\n\n${digest.headline}\n\n${digest.summary}\n\n${digest.encouragement}`;
  return { to, subject: title, html: layout(title, body, settingsFooter(appUrl)), text };
}

/** Sample email a member can send themselves to confirm reminders reach them. */
export function testEmail(to: string, name: string, appUrl: string): Email {
  const title = 'Saanjh reminders are working';
  const body = `<p>Hello ${escapeHtml(name)}, this is a test. Medicine and appointment reminders will arrive at this address.</p><p>${button('Open Saanjh', appUrl, true)}</p>`;
  return {
    to,
    subject: title,
    html: layout(title, body, settingsFooter(appUrl)),
    text: `${title}\n\n${appUrl}`,
  };
}
